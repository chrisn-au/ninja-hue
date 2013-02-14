var util = require('util')
  , stream = require('stream')
  , os = require('os')
  , helpers = require('./lib/helpers')
  , Hue = require('hue.js')
  , Light = require('./lib/Light')
  , configHandlers = require('./lib/config');

util.inherits(hue,stream);
module.exports = hue;

function hue(opts,app) {

  var self = this;

  this._app = app;
  this._opts = opts;
  this._opts.stations = opts.stations || [];

  // Todo: use node ID
  this.appName = 'Hue Ninja Module';

  app.on('client::up', function() {

    if (self._opts.stations.length>0) {
      self.loadStations.call(self);
    } else {
      self.findStations.call(self);
    }
  });
};

var HUE_ANNOUNCEMENT = {
  "contents": [
    { "type": "heading",      "text": "New Philips Hue Link Detected" },
    { "type": "paragraph",    "text": "To enable your Hue lights on the dashboard please press the link button on your Hue base station." },
  ],
  "actions": []
};
/**
 * Called when a user prompts a configuration
 * @param  {Object}   payload The return payload from the UI
 * @param  {String}   rpc     Used to match up requests.
 * @param  {Function} cb      Callback with return data
 */
hue.prototype.config = function(rpc,cb) {
  console.log(rpc);
  var self = this;

  if (!rpc) {
    return configHandlers.probe.call(this,cb);
  }

  switch (rpc.method) {
    case 'manual_get_ip':  return configHandlers.manual_get_ip.call(this,rpc.params,cb); break;
    case 'manual_set_ip':  return configHandlers.manual_set_ip.call(this,rpc.params,cb); break;
    case 'search':         return configHandlers.search.call(this,rpc.params,cb);        break;
    default:               return cb(true);                                              break;
  }
};


hue.prototype.findStations = function() {
  this._app.log.info('Hue: No configuration')
  var self = this;

  // If we do not want to auto register
  if (!this._opts.autoRegister) return;

  Hue.discover(function(stations) {
    stations.forEach(function(station) {

      // If we have already registered this
      if (self._opts.stations.indexOf(station)>-1) return;

      // If we have already announced this
      if (self._opts.sentAnnouncements.indexOf(station) > -1) return;

      self.emit('announcement',HUE_ANNOUNCEMENT);
      self._opts.sentAnnouncements.push(station);
      self.save();
      self.registerStation(station);
    });
  });
};

hue.prototype.registerStation = function(station,cb) {

  if (this._opts.stations.indexOf(station)>-1) {
    // We already have this station registered.
    this._app.log.info('Hue: Already configured Hue %s, aborting',station);
    return;
  }

  var self = this;

  var client = Hue.createClient({
    stationIp:station,
    appName:this.appName
  });

  var registerOpts = {
    interval:2000,
    attempts:0
  };

  self._app.log.info('Hue: Please press link button on station %s',station);

  client.register(registerOpts,function(err) {

    if (err) {
      // Do nothing?
      self._app.log.info('Timed out waiting for station');
      cb(err);
      return;
    }

    self._app.log.info('Hue: station %s registered, saving',station);
    self._opts.stations.push(station);

    self.save();

    self.loadStations();
    cb(null)
  });
};

hue.prototype.loadStations = function() {

  this._opts.stations.forEach(this.fetchLights);
};

hue.prototype.fetchLights = function(station,stationIndex) {

  var self = this;

  var client = Hue.createClient({
    stationIp:station,
    appName:this.appName
  });

  client.lights(function(err,lights) {
    if (err) {
      // TODO check we are registered
      self._app.log.error(err);
      return;
    }

    Object.keys(lights).forEach(function(lightIndex) {

      self.emit('register',new Light(client,stationIndex,lightIndex))
    });
  });
};
