import { extend, isFn, getWindow, inherit, toWarnDev, __type } from "./util";

/**
 * 为了兼容0.13之前的版本
 */
const NOBIND = {
    render: 1,
    shouldComponentUpdate: 1,
    componentWillReceiveProps: 1,
    componentWillUpdate: 1,
    componentDidUpdate: 1,
    componentWillMount: 1,
    componentDidMount: 1,
    componentWillUnmount: 1,
    componentDidUnmount: 1
};

function collectMixins(mixins) {
    let keyed = {};

    for (let i = 0; i < mixins.length; i++) {
        let mixin = mixins[i];
        if (mixin.mixins) {
            applyMixins(mixin, collectMixins(mixin.mixins));
        }

        for (let key in mixin) {
            if (mixin.hasOwnProperty(key) && key !== "mixins") {
                (keyed[key] || (keyed[key] = [])).push(mixin[key]);
            }
        }
    }

    return keyed;
}
const MANY_MERGED = {
    getInitialState: 1,
    getDefaultProps: 1,
    getChildContext: 1
};

function flattenHooks(key, hooks) {
    let hookType = __type.call(hooks[0]).slice(8, -1);
    if (hookType === "Object") {
        // Merge objects
        let ret = {};
        for (let i = 0; i < hooks.length; i++) {
            extend(ret, hooks[i]);
        }
        return ret;
    } else if (hookType === "Function" && hooks.length > 1) {
        return function () {
            let ret = {},
                r,
                hasReturn = MANY_MERGED[key];
            for (let i = 0; i < hooks.length; i++) {
                r = hooks[i].apply(this, arguments);
                if (hasReturn && r) {
                    extend(ret, r);
                }
            }
            if (hasReturn) {
                return ret;
            }
            return r;
        };
    } else {
        return hooks[0];
    }
}
function getComponent() {
    let window = getWindow();
    if (!window.React || !window.React.Component) {
        throw "Please load the React first.";
    }
    return window.React.Component;
}
function applyMixins(proto, mixins) {
    for (let key in mixins) {
        if (mixins.hasOwnProperty(key)) {
            proto[key] = flattenHooks(key, mixins[key].concat(proto[key] || []));
        }
    }
}

//创建一个构造器
function newCtor(className, spec) {
    let curry = Function(
        "ReactComponent",
        "blacklist",
        "spec",
        `return function ${className}(props, context) {
      ReactComponent.call(this, props, context);
     if(!(this instanceof ReactComponent)){
         throw "muse new Component(...)"
     }
     for (var methodName in this) {
        var method = this[methodName];
        if (typeof method  === "function"&& !blacklist[methodName]) {
          this[methodName] = method.bind(this);
        }
      }

      if (spec.getInitialState) {
        var test = this.state = spec.getInitialState.call(this);
        if(!(test === null || ({}).toString.call(test) == "[object Object]")){
          throw "Component.getInitialState(): must return an object or null"
        }
      }
  };`
    );


    return curry(getComponent(), NOBIND, spec);
}

export default function createClass(spec) {
    if (!isFn(spec.render)) {
        throw "createClass(...): Class specification must implement a `render` method.";
    }
    let Constructor = newCtor(spec.displayName || "Component", spec);
    let proto = inherit(Constructor, getComponent());
    //如果mixins里面非常复杂，可能mixin还包含其他mixin
    if (spec.mixins) {
        applyMixins(spec, collectMixins(spec.mixins));
    }

    extend(proto, spec);

    if (spec.statics) {
        extend(Constructor, spec.statics);
        if (spec.statics.getDefaultProps) {
            throw "getDefaultProps is not statics";
        }
    }

    "propTypes,contextTypes,childContextTypes,displayName".replace(
        /\w+/g,
        function (name) {
            if (spec[name]) {
                let props = (Constructor[name] = spec[name]);
                if (name !== "displayName") {
                    for (let i in props) {
                        if (!isFn(props[i])) {
                            toWarnDev(`${i} in ${name} must be a function`); // eslint-disable-line
                        }
                    }
                }
            }
        }
    );

    if (isFn(spec.getDefaultProps)) {
        Constructor.defaultProps = spec.getDefaultProps();
    }

    return Constructor;
}
