import { WorkerEntrypoint, DurableObject } from "cloudflare:workers";
import * as exports from "./index.js";

Error.stackTraceLimit = 100;
const initState = exports.__worker_init_state();

function checkReinitialize() {
  if (initState.criticalError) {
    console.log("Reinitializing Wasm application");
    exports.__wbg_reset_state();
    initState.criticalError = false;
    initState.instanceId++;
  }
}

addEventListener('error', (e) => {
  handleMaybeCritical(e.error);
});

function handleMaybeCritical(e) {
  if (e instanceof WebAssembly.RuntimeError) {
    console.error('Critical', e);
    initState.criticalError = true;
  }
}

class Entrypoint extends WorkerEntrypoint {}

$HANDLERS

// Helper to lazily create the RPC instance
Entrypoint.prototype._getRpc = function (Ctor) {
  if (!this._rpcInstanceMap) this._rpcInstanceMap = new Map();
  if (!this._rpcInstanceMap.has(Ctor)) {
    this._rpcInstanceMap.set(Ctor, new Ctor(this.env));
  }
  return this._rpcInstanceMap.get(Ctor);
};

const EXCLUDE_RPC_EXPORT = ["constructor", "new", "free"];

// Register RPC entrypoint methods into Entrypoint
Object.entries(exports).forEach(([exportName, exportValue]) => {
  if (typeof exportValue === "function" && exportValue.prototype?.__is_rpc__) {
    const Ctor = exportValue;

    const methodNames = Object.getOwnPropertyNames(Ctor.prototype)
      .filter(name => !EXCLUDE_RPC_EXPORT.includes(name) && typeof exportValue.prototype[name] === "function");

    for (const methodName of methodNames) {
      if (!Entrypoint.prototype.hasOwnProperty(methodName)) {
        Entrypoint.prototype[methodName] = function (...args) {
          const rpc = this._getRpc(Ctor);
          return rpc[methodName](...args);
        };
      }
    }
  }
});

function createDurableObjectWrapper(OriginalClass) {
  // Collect all method names from the original prototype, excluding wasm-bindgen internals.
  const methodNames = Object.getOwnPropertyNames(OriginalClass.prototype)
    .filter(name => name !== 'constructor' && name !== 'free' && typeof OriginalClass.prototype[name] === 'function');

  const WrappedClass = class extends DurableObject {
    constructor(...args) {
      super(...args);
      checkReinitialize();
      this._inner = Reflect.construct(OriginalClass, args, new.target);
      this._instanceId = initState.instanceId;
      this._ctor = OriginalClass;
      this._args = args;
    }

    _checkReinit() {
      if (this._instanceId !== initState.instanceId) {
        checkReinitialize();
        this._inner = Reflect.construct(this._ctor, this._args, this._ctor);
        this._instanceId = initState.instanceId;
      }
    }
  };

  for (const methodName of methodNames) {
    const original = OriginalClass.prototype[methodName];
    if (original.constructor === Function) {
      // Synchronous
      WrappedClass.prototype[methodName] = function (...args) {
        this._checkReinit();
        try {
          return this._inner[methodName](...args);
        } catch (e) {
          handleMaybeCritical(e);
          throw e;
        }
      };
    } else {
      // Async (returns Promise)
      WrappedClass.prototype[methodName] = async function (...args) {
        this._checkReinit();
        try {
          return await this._inner[methodName](...args);
        } catch (e) {
          handleMaybeCritical(e);
          throw e;
        }
      };
    }
  }

  return WrappedClass;
}

const instanceProxyHooks = {
  set: (target, prop, value, receiver) => Reflect.set(target.instance, prop, value, receiver),
  has: (target, prop) => Reflect.has(target.instance, prop),
  deleteProperty: (target, prop) => Reflect.deleteProperty(target.instance, prop),
  apply: (target, thisArg, args) => Reflect.apply(target.instance, thisArg, args),
  construct: (target, args, newTarget) => Reflect.construct(target.instance, args, newTarget),
  getPrototypeOf: (target) => Reflect.getPrototypeOf(target.instance),
  setPrototypeOf: (target, proto) => Reflect.setPrototypeOf(target.instance, proto),
  isExtensible: (target) => Reflect.isExtensible(target.instance),
  preventExtensions: (target) => Reflect.preventExtensions(target.instance),
  getOwnPropertyDescriptor: (target, prop) => Reflect.getOwnPropertyDescriptor(target.instance, prop),
  defineProperty: (target, prop, descriptor) => Reflect.defineProperty(target.instance, prop, descriptor),
  ownKeys: (target) => Reflect.ownKeys(target.instance),
};

const classProxyHooks = {
  construct(ctor, args, newTarget) {
    try {
      checkReinitialize();
      const instance = {
        instance: Reflect.construct(ctor, args, newTarget),
        instanceId: initState.instanceId,
        ctor,
        args,
        newTarget
      };
      return new Proxy(instance, {
        ...instanceProxyHooks,
        get(target, prop, receiver) {
          if (target.instanceId !== initState.instanceId) {
            target.instance = Reflect.construct(target.ctor, target.args, target.newTarget);
            target.instanceId = initState.instanceId;
          }
          const original = Reflect.get(target.instance, prop, receiver);
          if (typeof original !== 'function') return original;
          if (original.constructor === Function) {
            return new Proxy(original, {
              apply(target, thisArg, argArray) {
                checkReinitialize();
                try {
                  return target.apply(thisArg, argArray);
                } catch (e) {
                  handleMaybeCritical(e);
                  throw e;
                }
              }
            });
          } else {
            return new Proxy(original, {
              async apply(target, thisArg, argArray) {
                checkReinitialize();
                try {
                  return await target.apply(thisArg, argArray);
                } catch (e) {
                  handleMaybeCritical(e);
                  throw e;
                }
              }
            });
          }
        }
      });
    } catch (e) {
      initState.criticalError = true;
      throw e;
    }
  }
};

export default new Proxy(Entrypoint, classProxyHooks);
