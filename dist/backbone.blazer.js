// Backbone.Blazer v0.0.2
;(function (root, factory) {
    // https://github.com/umdjs/umd/blob/master/returnExports.js
    if (typeof exports === 'object') {
        // Node
        module.exports = factory(require('jquery'), require('underscore'), require('backbone'));
    } else if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define(['jquery', 'underscore', 'backbone'], factory);
    } else {
        // Browser globals (root is window)
        factory(root.$, root._, root.Backbone, root);
    }
})(this, function ($, _, Backbone, root) {
    'use strict';

    Backbone.Blazer = {};
    
    Backbone.Blazer.Route = function(options) {
        this.options = _.extend({}, _.result(this, 'options'), options);
        this.initialize.apply(this, arguments);
        this.on('enter', this.activate);
        this.on('exit', this.deactivate);
    };
    
    Backbone.Blazer.Route.extend = Backbone.Model.extend;
    
    _.extend(Backbone.Blazer.Route.prototype, Backbone.Events, {
        initialize: function() {},
        destroy: function() {
            this.stopListening();
            return this;
        },
        prepare: function() {},
        execute: function() {},
        exit: function() {},
        error: function() {},
        canNavigate: function(fragment, options, router) {},
        redirect: function(fragment) {
            return {
                redirectFragment: fragment
            };
        },
        activate: function(ctx) {},
        deactivate: function(ctx) {},
        prependFilter: function(before, after) {
            this.filters = this.filters || [];
            var filter = Backbone.Blazer.Router.createFilter(before, after);
            if (!_.isEmpty(filter)) this.filters.unshift(filter);
            return this;
        },
        appendFilter: function(before, after) {
            this.filters = this.filters || [];
            var filter = Backbone.Blazer.Router.createFilter(before, after);
            if (!_.isEmpty(filter)) this.filters.push(filter);
            return this;
        }
    });
    
    Backbone.Blazer.Section = Backbone.Blazer.Route.extend({
        constructor: function(options) {
            Backbone.Blazer.Route.apply(this, options);
            this.router = new Backbone.Blazer.Router(options);
            this.router.options.history = false;
            this.on('before:execute', function(ctx) {
                ctx.section = this;
            });
        },
        
        execute: function(ctx) {
            this.router.executeUrl(ctx.parameters.path || '');
        },
        
        route: function(routeName, route, config) {
            return this.router.route(routeName, route, config);
        },
        
        activate: function(ctx) {
            if (this.router.current && this.router.current.handler
                && this.router.current.handler.activate) {
                this.router.current.handler.activate(ctx);
            }
        },
        
        deactivate: function(ctx) {
            if (this.router.current && this.router.current.handler
                && this.router.current.handler.deactivate) {
                this.router.current.handler.deactivate(ctx);
            }
        }
    });
    
    Backbone.Blazer.Router = Backbone.Router.extend({
        constructor: function(options) {
            Backbone.Router.apply(this, arguments);
            options = options || {};
            this.options = _.extend({}, _.result(this, 'options'), _.omit(options, 'channel'));
            this.handlers = [];
            
            if (_.isObject(Backbone.Radio) && options.channel !== false) {
                var channelName = options.channel || _.result(this, 'channelName') || 'routing';
                var channel = this.channel = Backbone.Radio.channel(channelName);
                this.channel.listenTo(this, 'all', function(eventName, ctx) {
                    channel.trigger.apply(channel, [eventName].concat(_.rest(arguments)));
                });
            }
        },
        
        start: function() {
            this.__stopped = false;
        },
        
        stop: function() {
            this.__stopped = true;
        },
        
        prependFilter: function(before, after) {
            this.filters = this.filters || [];
            var filter = Backbone.Blazer.Router.createFilter(before, after);
            if (!_.isEmpty(filter)) this.filters.unshift(filter);
            return this;
        },
        
        appendFilter: function(before, after) {
            this.filters = this.filters || [];
            var filter = Backbone.Blazer.Router.createFilter(before, after);
            if (!_.isEmpty(filter)) this.filters.push(filter);
            return this;
        },
        
        addRoutes: function(routes) {
            var isArray = _.isArray(routes);
            _.each(routes, function(route, name) {
                var options = _.omit(route, 'name', 'path');
                var routeName = isArray ? route.name : (name || route.name);
                if (_.isEmpty(routeName)) {
                    console.warn('Invalid route');
                } else {
                    this.route(routeName, route.path || '', options);
                }
            }.bind(this));
        },
        
        route: function(routeName, route, config) {
            if (arguments.length < 3 && !_.isString(route)) {
                config = route, route = routeName;
                routeName = _.isString(route) ? route.replace(/\/[:\*]?/g, '-').toLowerCase() : null;
            } else {
                config = config || {};
            }
            
            var existing = this.getRoute(routeName);
            if (existing) console.warn('Route `%s` already assigned: %s', routeName, existing);
            
            if (_.isObject(config) && !(config instanceof Backbone.Blazer.Route)) {
                var RouteConstructor;
                if (_.isFunction(this.routeConstructor) // plain function, not a constructor
                    && !(this.routeConstructor.prototype instanceof Backbone.Blazer.Route)) {
                    RouteConstructor = this.routeConstructor(config);
                } else {
                    RouteConstructor = this.routeConstructor;
                }
                RouteConstructor = RouteConstructor || Backbone.Blazer.Route;
                config = new RouteConstructor(config);
            }
            
            var path = this.options.path || this.path;
            
            if (_.isString(route) && _.isString(path)) {
                if (_.isEmpty(route)) {
                    route = path;
                } else {
                    route = path + '/' + route;
                }
            }
            
            var routePath = _.isString(route) ? route : null;
            
            if (!_.isRegExp(route)) route = this._routeToRegExp(route);
            
            var router = this;
            var routeData = {
                handler: config,
                router: this
            };
            
            routeData.route = routePath;
            routeData.name = routeName;
            routeData.url = function(params) {
                var defaults = _.extend({}, routeData.parameters);
                params = _.isArray(params) ? params : (_.isObject(params) ? _.extend(defaults, params) : defaults);
                return routeData.router.getUrl(routeName, params);
            };
            
            var routeHandler = function(fragment) {
                routeData = _.extend({}, routeData);
                routeData.params = router._extractParameters(route, fragment);
                routeData.parameters = _.extend({}, router.defaults, router.options.defaults);
                if (_.isString(routeData.route) && !_.isEmpty(routeData.params)) {
                    var params = {};
                    var args = [];
                    routeData.route.replace(/\/?[:\*](\w+)/g, function (segment, key) {
                        if (key === 'params') {
                            var value = routeData.params[args.length];
                            params = router.deserializeParams(value);
                        } else {
                            args.push(key);
                        }
                    });
                    _.extend(routeData.parameters, _.object(args, routeData.params.slice(0, args.length)));
                    _.defaults(routeData.parameters, params);
                }
                if (router.__stopped && routeData.handler) {
                    router.trigger('route:unhandled', routeData);
                    router._cancelRoute(router, routeData.handler, routeData);
                } else if (router.__stopped) {
                    router.trigger('route:unhandled', routeData);
                } else {
                    router.handleRoute(routeData);
                }
            };
            
            var handler = { regexp: route, callback: routeHandler, handler: config };
            if (routeName) handler.name = routeName;
            if (routePath) handler.route = routePath;
            
            this.handlers.push(handler);
            
            if (this.options.history !== false) {
                Backbone.history.route(route, routeHandler);
            }
            
            return this;
        },
        
        section: function(routeName, root, options) {
            if (_.isObject(root)) options = root, root = null;
            if (!_.isString(root)) root = routeName;
            options = _.extend({ root: root }, options);
            var route = root + '(/*path)';
            var handler = new Backbone.Blazer.Section(options);
            this.route(routeName, route, handler);
            return handler;
        },
        
        executeRoute: function(routeName, params) {
            return this.executeUrl(this.getUrl(routeName, params));
        },
        
        executeUrl: function(fragment) {
            return _.any(this.handlers, function(handler) {
                if (handler.regexp.test(fragment)) {
                    handler.callback(fragment);
                    return true;
                }
            });
        },
        
        navigate: function(fragment, options) {
            options = options || {};
            
            if (this.canNavigate(fragment, options) === false) {
                return; // rejected
            }
            
            if (this.previous && this.previous.handler instanceof Backbone.Blazer.Route
                && this.previous.handler.canNavigate(fragment, options, this) === false) {
                return; // rejected
            }
            
            if (this.current && this.current.handler instanceof Backbone.Blazer.Route
                && this.current.handler.canNavigate(fragment, options, this) === false) {
                return; // rejected
            }
            
            return Backbone.Router.prototype.navigate.call(this, fragment, options);
        },
        
        navigateTo: function(routeName, params, options) {
            var url = this.getUrl(routeName, params);
            return this.navigate(url, options);
        },
        
        get: function(routeName) {
            return _.find(this.handlers, function(handler) {
                return handler.name === routeName;
            });
        },
        
        getRoute: function(routeName) {
            var handler = this.get(routeName);
            return handler && handler.route;
        },
        
        getUrl: function(routeName, params) {
            var root = this.options.root || this.root || '';
            var route = this.getRoute(routeName);
            if (_.isString(route)) {
                var args = _.rest(arguments);
                if (_.isEmpty(args)) args.push({});
                if (_.isObject(args[0])) {
                    _.defaults(args[0], this.options.defaults, this.defaults);
                }
                var url = this.url.apply(this, [route].concat(args));
                if (_.isEmpty(url)) return root;
                return _.isEmpty(root) ? url : root + '/' + url;
            }
            return root;
        },
        
        getHandler: function(routeName) {
            var handler = this.get(routeName);
            return handler && handler.handler;
        },
        
        handleRoute: function(routeData) {
            var handler = routeData.handler;
            var router = this;
            
            var previous = this.current ? this.current : null;
            
            var current = {};
            current.router = router;
            current.handler = handler;
            current.name = _.isString(routeData.name) ? routeData.name : '';
            current.route = routeData.route || '';
            current.url = _.isFunction(routeData.url) ? routeData.url(routeData.params || []) : '';
            current.params = routeData.params || [];
            current.parameters = routeData.parameters || {};
            
            this.previous = previous;
            this.current = current;
            
            if (_.isString(handler)) {
                if (_.isFunction(this[handler])) {
                    this[handler].apply(this, routeData.params);
                    done();
                }
            } else if (handler instanceof Backbone.Blazer.Route) {
                this._handleBlazerRoute(handler, routeData, done);
            } else if (_.isFunction(handler)) {
                handler.apply(this, routeData);
            } else {
                throw new Error('Incorrectly configured route');
            }
            
            function done() {
                var name = router.current.route;
                var args = routeData.params || [];
                router.trigger.apply(router, ['route:' + name].concat(args));
                router.trigger('route', name, args);
                Backbone.history.trigger('route', router, name, args);
            }
        },
        
        canNavigate: function(fragment, options) {
            // Hook method
        },
        
        url: function(path, params) {
            if (_.isObject(params) && !_.isArray(params)) {
                params = params;
            } else if (arguments.length > 1) {
                params = _.flatten(_.rest(arguments));
            } else {
                params = {};
            }
            var index = 0;
            var keys = [];
            var appendParams;
            
            path = (path + '').replace(/[\(\)]/g, '');
            var url = path.replace(/\/?[:\*](\w+)/g, function (segment, key) {
                var value = params[key] || params[index++];
                var blank = _.isUndefined(value) || _.isNull(value);
                if (!blank) keys.push(key);
                if (!appendParams && key === 'params') appendParams = true;
                if (path.indexOf(segment) === 0 && !blank) return value;
                return blank ? '' : '/' + value;
            });
            
            if (appendParams && _.isObject(params) && !_.isArray(params)) {
                var serialized = this.serializeParams(_.omit(params, keys));
                url = _.isEmpty(url) ? serialized : url + '/' + serialized;
            }
            
            return url;
        },
        
        serializeParams: function(options) {
            return (_.map(_.filter(_.pairs(options), 
                function(pair){ return pair[1]; }), 
                function(pair){ return pair.join(':');
            })).join('+');
        },
        
        deserializeParams: function(params) {
            if (!_.isString(params) || _.isEmpty(params)) return {};
            var options = {};
            params = params.split('+');
            _.each(params, function(pair){
                var values = pair.split(':');
                options[values[0]] = values[1];
            });
            return options;
        },
        
        matchesUrl: function(url, params) {
            if (arguments.length > 1) url = this.url(url, params);
            if (!this.current) {
                return url === '';
            } else if (this.current.url === '' && this.current.url === url) {
                return true;
            } else if (this.current.url === '') {
                return false;
            } else {
                return _.isString(this.current.url) && _.isString(url)
                    && this.current.url === url;
            }
        },
        
        matchesRoute: function(routeName, params) {
            return this.matchesUrl(this.getUrl(routeName, params));
        },
        
        isAncestor: function(routeName) {
            var current = (this.current && this.current.name);
            return current && _.isString(routeName) && current.indexOf(routeName + '.') === 0;
        },
        
        ancestors: function(routeName, params) {
            if (arguments.length === 0) {
                routeName = (this.current && this.current.name) || '';
                params = (this.current && this.current.parameters) || {};
            } else if (_.isObject(routeName)) {
                params = _.extend({}, routeName);
                routeName = (this.current && this.current.name) || '';
            }
            var nodes = [];
            var segments = routeName.split('.');
            while (segments.length) {
                var name = segments.join('.');
                var route = this.getRoute(name);
                if (route) {
                    var url = this.url(route, params);
                    nodes.push({ name: name, route: route, url: url });
                }
                segments.pop();
            }
            return nodes.reverse();
        },
        
        nodes: function(routeName, params) {
            if (arguments.length === 0) {
                routeName = (this.current && this.current.name) || '';
                params = (this.current && this.current.parameters) || {};
            } else if (_.isObject(routeName)) {
                params = _.extend({}, routeName);
                routeName = (this.current && this.current.name) || '';
            }
            var nodes = [];
            var match = routeName + '.';
            _.each(this.handlers, function(handler) {
                if (handler.name && handler.name.indexOf(match) === 0) {
                    var url = this.url(handler.route, params);
                    nodes.push({ name: handler.name, route: handler.route, url: url });
                } 
            }.bind(this));
            return nodes;
        },
        
        siblings: function(routeName, params) {
            if (arguments.length === 0) {
                routeName = (this.current && this.current.name) || '';
                params = (this.current && this.current.parameters) || {};
            } else if (_.isObject(routeName)) {
                params = _.extend({}, routeName);
                routeName = (this.current && this.current.name) || '';
            }
            var nodes = [];
            var segments = routeName.split('.').slice(0, -1);
            var match = segments.join('.') + '.';
            var nomatch = routeName + '.';
            _.each(this.handlers, function(handler) {
                if (handler.name && handler.name.indexOf(match) === 0 && handler.name.indexOf(nomatch) === -1) {
                    var url = this.url(handler.route, params);
                    var active = handler.name === routeName;
                    nodes.push({ name: handler.name, route: handler.route, url: url, active: active });
                } 
            }.bind(this));
            return nodes;
        },
        
        _handleBlazerRoute: function(route, routeData, callback) {
            var router = this;
            var previous = this.previous && this.previous.handler;
            var dfd;
            
            route.trigger('before:execute', routeData, route);
            router.trigger('before:execute', routeData, route);
            
            if (previous && _.isFunction(previous.exit)) {
                dfd = router._runHandler(previous.exit, router, previous, routeData);
            } else {
                dfd = $.Deferred().resolve().promise();
            }
            
            dfd.then(function() {
                return router._runBeforeFilters(router, route, routeData);
            }).then(function() {
                if (previous) previous.trigger('exit', routeData, route);
                route.trigger('enter', routeData, route);
                return router._runHandler(route.prepare, router, route, routeData);
            }).then(function() {
                if (router.current && router.current.handler !== route) {
                    return; // when redirected
                }
                
                router._runHandler(route.execute, router, route, routeData);
                
                if (_.isFunction(callback)) callback(routeData, route);
                
                route.trigger('after:execute', routeData, route);
                router.trigger('after:execute', routeData, route);
                
                router._runAfterFilters(router, route, routeData);
            }).fail(function(error) {
                if (error instanceof Error) routeData.error = error;
                
                if (router.current && router.current.handler !== route) {
                    return; // when redirected
                } else {
                    router._cancelRoute(router, route, routeData);
                }
                
                var args = Array.prototype.slice.call(arguments);
                args.unshift(routeData);
                
                var errorHandled;
                router._runHandler(function(routeData) {
                    var result = route.error.apply(route, args);
                    errorHandled = result === true;
                    return result;
                }, router, route, routeData);
                
                if (!errorHandled) {
                    router.trigger('error', args);
                }
            });
        },
        
        _cancelRoute: function(router, route, routeData) {
            route.trigger('before:cancel', routeData, route);
            router.trigger('before:cancel', routeData, route);
            router.current = router.previous;
            var previousFragment = router.previous && router.previous.url;
            router.navigate(previousFragment || '', { replace: true });
            route.trigger('after:cancel', routeData, route);
            router.trigger('after:cancel', routeData, route);
        },
        
        _runBeforeFilters: function(router, route, routeData) {
            return this._runFilters('beforeRoute', router, route, routeData);
        },
        
        _runAfterFilters: function(router, route, routeData) {
            return this._runFilters('afterRoute', router, route, routeData);
        },
        
        _runFilters: function(which, router, route, routeData) {
            var filters = (this.filters || []).concat(route.filters || []),
                stageFilters = _.compact(_.pluck(filters, which)),
                def = $.Deferred();
                
            var chain = _.reduce(stageFilters, function(previous, filter) {
                if (!previous) {
                    return router._runHandler(filter, router, route, routeData);
                }
                
                return previous.then(function() {
                    return router._runHandler(filter, router, route, routeData);
                });
            }, null);
            
            if (chain) {
                chain.then(def.resolve);
            } else {
                def.resolve();
            }
            
            return def.promise();
        },
        
        _runHandler: function(handler, router, route, routeData) {
            var result = handler.call(route, routeData);
            
            if (result && result.redirectFragment) {
                router.navigate(result.redirectFragment, { trigger: true });
                return $.Deferred().reject().promise();
            } else if (result === false) {
                router._cancelRoute(router, route, routeData);
                return $.Deferred().reject().promise();
            }
            
            return $.when(result);
        }
    }, {
        filters: {},
        
        registerFilter: function(filterName, fn) {
            if (_.isFunction(fn)) this.filters[filterName] = fn;
        },
        
        createFilter: function(before, after) {
            var filter = {};
            if (_.isString(before)) before = this.filters[before];
            if (_.isString(after)) before = this.filters[after];
            if (_.isFunction(before)) filter.beforeRoute = before;
            if (_.isFunction(after)) filter.afterRoute = after;
            return filter;
        }
    });
});
