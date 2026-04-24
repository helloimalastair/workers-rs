import { WorkerEntrypoint, DurableObject } from "cloudflare:workers";
import * as exports from "./index.js";

Error.stackTraceLimit = 100;
const initState = exports.__worker_init_state();

class Entrypoint extends WorkerEntrypoint {}

$HANDLERS

function createDurableObjectWrapper(OriginalClass) {
  const methodNames = Object.getOwnPropertyNames(OriginalClass.prototype)
    .filter(name => name !== 'constructor' && name !== 'free' && typeof OriginalClass.prototype[name] === 'function');

  const WrappedClass = class extends DurableObject {
    constructor(...args) {
      super(...args);
      this._inner = Reflect.construct(OriginalClass, args, new.target);
      this._instanceId = initState.instanceId;
      this._ctor = OriginalClass;
      this._args = args;
    }

    _checkReinit() {
      if (this._instanceId !== initState.instanceId) {
        this._inner = Reflect.construct(this._ctor, this._args, this._ctor);
        this._instanceId = initState.instanceId;
      }
    }
  };

  for (const methodName of methodNames) {
    WrappedClass.prototype[methodName] = function (...args) {
      this._checkReinit();
      return this._inner[methodName](...args);
    };
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
        return Reflect.get(target.instance, prop, receiver);
      }
    });
  }
};

export default new Proxy(Entrypoint, classProxyHooks);
