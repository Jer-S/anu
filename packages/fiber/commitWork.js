import {
    PLACE,
    CONTENT,
    ATTR, //UPDATE
    NULLREF,
    DETACH, //DELETION
    HOOK,
    REF,
    CALLBACK,
    CAPTURE,
    effectLength,
    effectNames,
} from "./effectTag";
import { guardCallback, removeFormBoundaries } from "./ErrorBoundary";
import { fakeObject } from "react-core/Component";

import { returnFalse, effects, arrayPush, emptyObject } from "react-core/util";
import { Renderer } from "react-core/createRenderer";
import { Refs } from "./Refs";
export function commitWork() {
    Renderer.batchedUpdates(function () {
        commitPlaceEffects(effects);
        var tasks = effects,
            task;
        while ((task = tasks.shift())) {
            commitOtherEffects(task, tasks);
        }
    }, {});

    let error = Renderer.catchError;
    if (error) {
        delete Renderer.catchError;
        throw error;
    }
}
/**
 * 提先执行所有RLACE任务
 * @param {Fiber} tasks
 */
export function commitPlaceEffects(tasks) {
    let ret = [];
    for (let i = 0, n = tasks.length; i < n; i++) {
        let fiber = tasks[i];
        let amount = fiber.effectTag;
        let remainder = amount / PLACE;
        let hasEffect = amount > 1;
        if (hasEffect && remainder == ~~remainder) {
            fiber.parent.insertPoint = null;
            Renderer.insertElement(fiber);
            fiber.hasMounted = true;
            fiber.effectTag = remainder;
            hasEffect = remainder > 1;
        }
        if (hasEffect) {
            ret.push(fiber);
        }
    }
    tasks.length = 0;
    arrayPush.apply(tasks, ret);
    return ret;
}

/**
 * 执行其他任务
 *
 * @param {Fiber} fiber
 */
export function commitOtherEffects(fiber, tasks) {
    let instance = fiber.stateNode || emptyObject;
    let amount = fiber.effectTag;
    let updater = instance.updater || fakeObject;
    //console.log(fiber.name, fiber.effectTag);
    for (let i = 0; i < effectLength; i++) {
        let effectNo = effectNames[i];
        if (effectNo > amount) {
            break;
        }
        if (amount % effectNo === 0) {
            amount /= effectNo;
            //如果能整除
            switch (effectNo) {
            case CONTENT:
                Renderer.updateContext(fiber);
                break;
            case ATTR:
                Renderer.updateAttribute(fiber);
                break;
            case NULLREF:
                if (!instance.__isStateless) {
                    Refs.fireRef(fiber, null);
                }
                break;
            case DETACH:
                if (fiber.tag > 3) {
                    Renderer.removeElement(fiber);
                } else {
                    if (fiber.hasMounted) {
                        updater.enqueueSetState = returnFalse;
                        guardCallback(instance, "componentWillUnmount", []);
                    }
                }
                delete fiber.hasMounted;
                delete fiber.stateNode;
                delete fiber.alternate;
                break;
            case HOOK:
                if (fiber.hasMounted) {
                    guardCallback(instance, "componentDidUpdate", [
                        updater.prevProps,
                        updater.prevState,
                        updater.snapshot,
                    ]);
                } else {
                    fiber.hasMounted = true;
                    guardCallback(instance, "componentDidMount", []);
                }
                delete fiber._hydrating;
                //这里发现错误，说明它的下方组件出现错误，不能延迟到下一个生命周期
                if (fiber.hasError) {
                    removeFormBoundaries(fiber);
                    Renderer.diffChildren(fiber, []);                       
                    tasks.push.apply(tasks, fiber.effects);
                    delete fiber.effects;
                    let n = Object.assign({}, fiber);
                    fiber.effectTag = 1;
                    n.effectTag = amount;
                    tasks.push(n);
                    return;
                }

                break;
            case REF:
                if (!instance.__isStateless) {
                    Refs.fireRef(fiber, instance);
                }
                break;
            case CALLBACK:
                //ReactDOM.render/forceUpdate/setState callback
                var queue = fiber.pendingCbs;
                fiber._hydrating = true; //setState回调里再执行setState
                queue.forEach(function (fn) {
                    fn.call(instance);
                });
                delete fiber._hydrating;
                delete fiber.pendingCbs;
                break;
            case CAPTURE: // 23
                var values = fiber.capturedValues;
                fiber.effectTag = amount;
                fiber.hasCatch = true;
                var a = values.shift();
                var b = values.shift();
                if (!values.length) {
                    delete fiber.capturedValues;
                }
                instance.componentDidCatch(a, b);
                break;
            }
        }
    }
    fiber.effectTag = 1;
}
