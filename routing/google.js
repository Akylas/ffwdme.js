var Base = require('./base');

var Google = Base.extend({
  /**
   * Creates a new instance of the Google routing service class.
   * When doing so, this object adds itself as the a global handler for route
   * responses.
   *
   * Options:
   * - apiKey
   *
   * @class The class represents a client for the ffwdme routing service
   * using Google.
   *
   * @augments ffwdme.Class
   * @constructs
   *
   */
  constructor: function(options) {
    this.base(options);
    this.bindAll(this, 'parse', 'error');

    this.queryParams.apiKey = ffwdme.options.google.apiKey;

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
  BASE_URL: 'https://maps.googleapis.com/maps/api/directions/json',
  direction: null,
  anchorPoint: null,
  route: null,
  queryParams: {
    mode: 'driving',
    lang: 'fr',
    region: 'fr',
    alternatives: false
  },

  streetsRegex: {
    'fr': /(?:(?:sur|rejoindre) <b>)(.*?)(?:<\/b>)/gi,
    'en': /(?:(?:on |near |onto |at |Head) <b>)(.*?)(?:<\/b>)/gi
  },
  roundaboutRegex: {
    'fr': /prendre la <b>([0-9])(?:.*?)<\/b> sortie/i,
    'en': /take the <b>([0-9])(?:.*?)<\/b> exit/i
  },
  instructionRegex: /(<div(?:.*?)>(.*?)<\/div>)/gi,

  fetch: function(_params) {

    _.assign(this.queryParams, _params);
    var params = _.assign(queryParams, {
      origin: _.isString(this.start) ? this.start : this.start.join(','),
      destination: _.isString(this.dest) ? this.dest : this.dest.join(',')
    });

    sdebug(params);

    var requestUrl = this.queryString(params, this.BASE_URL);
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
    if (response.error_message) return this.error(response.error_message);
    if (response.routes.length === 0) return this.error('no route found for "' + this.dest + '"');
    var route = response.routes[0];
    var bounds = route.bounds;

    var routeStruct = {
      summary: {
        overview: route.summary,
        warnings: route.warnings,
        fare: route.fare,
        overviewPath: ffwdme.Route.decodePolyline(route.overview_polyline.points),
        path: [],
        boundingBox: {
          ne: [bounds.northeast.lat, bounds.northeast.lng],
          sw: [bounds.southwest.lat, bounds.southwest.lng]
        },
      },
      legs: []
    };
    var distance = 0,
      duration = 0,
      leg, instruction, steps, nbLegs = route.legs.length;
    for (var i = 0; i < nbLegs; i++) {
      leg = route.legs[i];
      var currentLeg = {
        directions: [],
        start: [leg.start_location.lat, leg.start_location.lng],
        end: [leg.end_location.lat, leg.end_location.lng],
        duration: leg.duration.value,
        distance: leg.distance.value
      };
      routeStruct.legs.push(currentLeg);
      if (i == 0) {
        routeStruct.summary.start = currentLeg.start;
      } else if (i === nbLegs - 1) {
        routeStruct.summary.end = currentLeg.end;
      }
      distance += currentLeg.distance;
      duration += currentLeg.duration;
      steps = leg.steps;
      for (var j = 0; j < steps.length; j++) {
        instruction = steps[j];
        var html_instruction = instruction.html_instructions.replace(this.instructionRegex, "<br>$2");
        var turnInfo = this.extractTurnInfos(instruction.maneuver);
        d = {
          instruction: html_instruction,
          distance: instruction.distance.value,
          distanceText: instruction.distance.text,
          duration: instruction.duration.value,
          durationText: instruction.duration.text,
          start: [instruction.start_location.lat, instruction.start_location.lng],
          end: [instruction.end_location.lat, instruction.end_location.lng],
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
          while (matches = this.streetsRegex[this.lang].exec(html_instruction)) {
            d.roundAboutExit = parseInt(matches[1]);
            break;
          }
        }

        routeStruct.summary.path = routeStruct.summary.path.concat(d.path);

        // Strip the streetname out of the route description
        while (matches = this.streetsRegex[this.lang].exec(html_instruction)) {
          d.street = matches[1];
          break;
        }
        currentLeg.directions.push(d);
      }
    };
    routeStruct.summary.duration = duration;
    routeStruct.summary.distance = distance;

    sdebug(JSON.stringify(routeStruct));

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

module.exports = Google;