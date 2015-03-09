var Base = require('./base');

var MapQuest = Base.extend({
  /**
   * Creates a new instance of the MapQuest routing service class.
   * When doing so, this object adds itself as the a global handler for route
   * responses.
   *
   * Options:
   * - apiKey
   *
   * @class The class represents a client for the ffwdme routing service
   * using MapQuest.
   *
   * @augments ffwdme.Class
   * @constructs
   *
   */
  constructor: function(options) {
    this.base(options);
    this.bindAll(this, 'parse', 'error');

    this.apiKey = ffwdme.options.mapquest.apiKey;

    if (options.anchorPoint) {
      this.anchorPoint = options.anchorPoint;
      this.direction = this.start;
      this.start = this.anchorPoint;
    }
  },

  /**
   * The base url for the service.
   *
   * @type String
   */
  BASE_URL: 'http://open.mapquestapi.com/directions/v2/route',

  // set via constructor
  apiKey: null,
  ambiguities: 'ignore',
  unit: 'm',

  mode: 'driving',

  avoid: null,

  lang: 'fr',

  region: 'fr',

  route: null,

  anchorPoint: null,

  direction: null,

  alternatives: false,
  streetsRegex: {
    'fr': /(?:(?:sur|rejoindre) <b>)(.*?)(?:<\/b>)/gi,
    'en': /(?:(?:on |near |onto |at |Head) <b>)(.*?)(?:<\/b>)/gi
  },
  roundaboutRegex: {
    'fr': /prendre la <b>([0-9])(?:.*?)<\/b> sortie/i,
    'en': /take the <b>([0-9])(?:.*?)<\/b> exit/i
  },

  fetch: function(_params) {

    _.assign(this, params);
    var params = _.assign({
      from: _.isString(this.start) ? this.start : this.start.join(','),
      to: _.isString(this.dest) ? this.dest: this.dest.join(',')
    }, _params);
    var requestUrl = this.queryString(_.assign({
      // inFormat:'json',
      // outFormat:'json',
      key: decodeURIComponent(this.apiKey)

    }, params), this.BASE_URL);
    var that = this;
    var request = Ti.Network.createHTTPClient({
      onload: function(e) {
        that.parse(JSON.parse(this.responseText));
      },
      onerror: function(e) {
        that.error(e.error);
      },
    });
    request.open('GET', requestUrl);
    request.send();
    sdebug('mp request', requestUrl);
    ffwdme.trigger(this.eventPrefix() + ':start', {
      routing: this
    });

    return ffwdme;
  },

  error: function(error) {
    this.base(error);
  },

  parse: function(response) {

    // check for error codes
    sdebug(response);

    if (response.info.statuscode >= 300 || response.route.routeError) {
      return this.error(response.info.messages[0]);
    }
    var route = response.routes[0];
    var bounds = route.bounds;

    var routeStruct = {
      directions: [],
      summary: {
        overview: route.summary,
        warnings: route.warnings,
        fare: route.fare,
        overviewPath: ffwdme.Route.decodePolyline(route.overview_polyline.points),
        path: [],
        boundingBox: {
          ne: bounds.northeast,
          sw: bounds.southwest
        },
      }
    };
    var distance = 0,
      duration = 0,
      leg, instruction, steps;
    for (var i = 0; i < route.legs.length; i++) {
      leg = route.legs[i];
      if (i == 0) {
        routeStruct.summary.start =leg.start_location;
      } else if (i == route.legs.length - 1) {
        routeStruct.summary.end = leg.end_location;
      }
      distance += leg.distance.value;
      duration += leg.duration.value;
      steps = leg.steps;
      for (var j = 0; j < steps.length; j++) {
        instruction = steps[j];
        var turnInfo = this.extractTurnInfos(instruction.maneuver);
        d = {
          instruction: instruction.html_instructions,
          distance: instruction.distance.value,
          distanceText: instruction.distance.text,
          duration: instruction.duration.value,
          durationText: instruction.duration.text,
          start: instruction.start_location,
          end: instruction.end_location,
          mode: instruction.travel_mode.toLowerCase(),
          turnAngle: turnInfo[1],
          turnType: turnInfo[0],
          finished: instruction.sign === 4,
          roundAbout: /roundabout/.test(instruction.maneuver),
          roundAboutExit: 0,
          street: '',
          path: ffwdme.Route.decodePolyline(instruction.polyline.points)
        };

        var matches;
        if (d.roundAbout) {
          while (matches = this.roundaboutRegex[this.lang].exec(d.instruction)) {
            d.roundAboutExit = parseInt(matches[1]);
            break;
          }
        }

        routeStruct.summary.path = routeStruct.summary.path.concat(d.path);

        // Strip the streetname out of the route description
        while (matches = this.streetsRegex[this.lang].exec(d.instruction)) {
          d.street = matches[1];
          break;
        }
        routeStruct.directions.push(d);
      }
    };
    routeStruct.summary.duration = duration;
    routeStruct.summary.distance = distance;

    this.route = new ffwdme.Route().parse(routeStruct);

    this.success(response, this.route);
  },

  extractTurnInfos: function(maneuver) {
    if (!maneuver) return ['C', 0];
    var result = '';
    var angle = 0;
    var steps = maneuver.split('-');
    for (var i = 0; i < steps.length; i++) {
      var step = steps[i];
      if (step === 'turn') {
        result += 'T';
      } else if (step === 'straight') {
        result += 'C';
      } else if (step === 'slight') {
        result += 'SL';
        angle -= 45;
      } else if (step === 'sharp') {
        result += 'SH';
        angle += 45;
      } else if (step === 'left') {
        result += 'L';
        angle += 90;
      } else if (step === 'right') {
        result += 'R';
        angle = -(angle + 90);
      } else if (step === 'fork') {
        result += 'F';
      } else if (step === 'ramp') {
        result += 'RM';
      } else if (step === 'keep') {
        result += 'K';
      } else if (step === 'roundabout') {
        result += 'RA';
      }
    };
    return [result, angle];
  },
});

module.exports = MapQuest;