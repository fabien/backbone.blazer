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
        error: function() {},
        canNavigate: function(fragment, options, router) {},
        redirect: function(fragment) {
            return {
                redirectFragment: fragment
            };
        },
        prependFilter: function(before, after) {
            this.filters = this.filters || [];
            var filter = Backbone.Blazer.Router.createFilter(before, after);
            if (!_.isEmpty(filter)) this.filters.unshift(filter);
        },
        appendFilter: function(before, after) {
            this.filters = this.filters || [];
            var filter = Backbone.Blazer.Router.createFilter(before, after);
            if (!_.isEmpty(filter)) this.filters.push(filter);
        }
    });
    
    Backbone.Blazer.Router = Backbone.Router.extend({
        constructor: function() {
            Backbone.Router.apply(this, arguments);
            this.namedRoutes = {};
            this.routeHandlers = {};
        },
        
        route: function(routeName, route, config) {
            if (arguments.length < 3) {
                config = route, route = routeName;
                routeName = _.isString(route) ? route.replace(/\/[:\*]?/g, '-').toLowerCase() : null;
            }
    
            if (!_.isEmpty(routeName)) {
                if (this.namedRoutes[routeName]) {
                    console.warn('Route `%s` already assigned: %s', routeName, this.namedRoutes[routeName]);
                }
                if (_.isString(route)) this.namedRoutes[routeName] = route;
                if (config instanceof Backbone.Blazer.Route) this.routeHandlers[routeName] = config;
            }
            
            if (!_.isRegExp(route)) {
                route = this._routeToRegExp(route);
            }
    
            var routeData = {
                handler: config,
                router: this
            };
            
            if (routeName && _.has(this.namedRoutes, routeName)) {
                routeData.route = this.namedRoutes[routeName];
                routeData.name = routeName;
                routeData.url = function(params) {
                    var defaults = _.extend({}, routeData.parameters);
                    params = _.isArray(params) ? params : (_.isObject(params) ? _.extend(defaults, params) : defaults);
                    return routeData.router.get(routeName, params);
                };
            }
            
            var router = this;
            Backbone.history.route(route, function(fragment) {
                routeData.params = router._extractParameters(route, fragment);
                routeData.parameters = {};
                if (_.isString(routeData.route) && !_.isEmpty(routeData.params)) {
                    var args = [];
                    routeData.route.replace(/\/[:\*](\w+)/g, function (segment, key) {
                        args.push(key);
                    });
                    routeData.parameters = _.object(args, routeData.params.slice(0, args.length));
                }
                router.handleRoute(routeData);
            });
            return this;
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
            var url = this.get(routeName, params);
            return this.navigate(url, options);
        },
        
        get: function(routeName, params) {
            var route = this.namedRoutes[routeName];
            if (_.isString(route) && arguments.length > 1) {
                route = this.url(route, params);
            }
            return route;
        },
        
        handler: function(routeName) {
            return this.routeHandlers[routeName];
        },
    
        handleRoute: function(routeData) {
            var handler = routeData.handler;
            var router = this;
            
            var previous = this.current ? this.current : null;
            
            var current = {};
            current.handler = handler;
            current.name = _.isString(routeData.name) ? routeData.name : '';
            current.route = routeData.route || '';
            current.url = _.isFunction(routeData.url) ? routeData.url(routeData.params || []) : '';
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
            path = (path + '').replace(/[\(\)]/g, '');
            return path.replace(/\/[:\*](\w+)/g, function (segment, key) {
                var match = params[key] || params[index++];
                return _.isUndefined(match) ? '' : '/' + match;
            });
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
            return this.matchesUrl(this.get(routeName, params));
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
                var route = this.get(name);
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
            _.each(_.keys(this.routeHandlers), function(name) {
                if (name.indexOf(match) === 0) {
                    var route = this.get(name);
                    if (route) {
                        var url = this.url(route, params);
                        nodes.push({ name: name, route: route, url: url });
                    }
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
            _.each(_.keys(this.routeHandlers), function(name) {
                if (name.indexOf(match) === 0 && name.indexOf(nomatch) === -1) {
                    var route = this.get(name);
                    if (route) {
                        var url = this.url(route, params);
                        var active = name === routeName;
                        nodes.push({ name: name, route: route, url: url, active: active });
                    }
                } 
            }.bind(this));
            return nodes;
        },
    
        _handleBlazerRoute: function(route, routeData, callback) {
            var router = this;
    
            route.trigger('before:execute', routeData, route);
            router.trigger('before:execute', routeData, route);
    
            this._runBeforeFilters(router, route, routeData).then(function() {
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
            }).fail(function() {
                if (router.current && router.current.handler !== route) {
                    return; // when redirected
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
