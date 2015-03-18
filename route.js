var Class = require('./class');
var geoUtils = require('./utils/geo');

var Route = Class.extend({
  /**
   * Creates a new route object.
   *
   * @class The route object represents a calculated route
   *  as it is returned by one of the routing services.
   *
   * @augments ffwdme.Class
   * @constructs
   *
   */
  constructor: function() {

  },

  summary: null,

  directions: null,

  parse: function(json) {
    _.assign(this, json);
    this.summary = json.summary;

    if (json.legs) {
      this.legs = json.legs;
      this.directions = _.reduce(this.legs, function(result, leg, legIndex) {
        _.each(leg.directions, function(direction, i) {
          direction.legIndex = legIndex;
          direction.directionIndexInLeg = i;
        });
        result = result.concat(leg.directions);
        return result;
      }, []);
      this.legsCount = this.legs.length;
      this.directionsCount = this.directions.length;
    } else {
      this.directions = json.directions;
      this.legs = [{
        directions:this.directions
      }];
      _.each(this.directions, function(direction, i) {
        direction.legIndex = 0;
        direction.directionIndexInLeg = i;
      });
      this.legsCount = 1;
      this.directionsCount = this.directions.length;
    }
    return this;
  },

  start: function() {
    var firstLeg = this.legs[0];
    var firstDirection = firstLeg[0];
    var firstPosition = firstDirection.path[0];
    return firstPosition;
  },

  destination: function() {
    var lastLeg = this.legs[this.legs.length - 1];
    var lastDirection = lastLeg.directions[this.directions.length - 1];
    var lastPosition = lastDirection.path[lastDirection.path.length - 1];
    return lastPosition;
  },

  /**
   * Tries to map the current position on the route.
   *
   * @param {ffwdme.LatLng} pos
   *   A ffwdme LatLng object
   * @param {Object} direction_index
   *   The index of the directions of the route to start
   *   searching for the nearest point of the route.
   * @param {Object} path_index
   *   The index of the single paths representing the direction
   *   above the start searching.
   * @param {Object} direction_max
   *   The maximum number of directions to go through.
   *
   * @return {Object}
   *   A hashtable containing the following information:
   *   directionIndex (int): The direction index of the nearest point found.
   *   prevPathIndex (int): The path index of the nearest point found.
   *   nextPathIndex (int): The path index of the nearest point found.
   *   distance (float): The distance to from the nearest point found to the captured position.
   *   point: (ffwdme.LatLng):The nearest point found on the route (keys: lat, lng).
   */
  nearestTo: function(pos, directionIndex, pathIndex, maxIterations) {
    var nearest = {
      distance: 999999,
      point: null,
      directionIndex: null,
      legIndex: null,
      prevPathIndex: null,
      nextPathIndex: null
    };

    var geo = geoUtils;
    var len = maxIterations ? Math.min(maxIterations, this.directionsCount) : this.directionsCount;

    for (var i = directionIndex; i < len; i++) {
      var direction = this.directions[i];
      var pathLen = direction.path.length - 1;
      var pathStart = (i === directionIndex) ? pathIndex : 0;

      for (var j = pathStart; j < pathLen; j++) {
        var point = geo.closestOnLine(
          direction.path[j],
          direction.path[j + 1],
          pos
        );

        var distance = geo.distance(pos, point);

        // not closer than before
        if (nearest.distance < distance) continue;

        nearest.distance = distance;
        nearest.point = point;
        nearest.directionIndex = i;
        nearest.legIndex = direction.legIndex;
        nearest.directionIndexInLeg = direction.directionIndexInLeg;
        nearest.prevPathIndex = j;
        nearest.nextPathIndex = j + 1;
      }
    }
    return nearest;
  }
}, {

  // This function is from Google's polyline utility.
  decodePolyline: function(polylineStr) {
    var len = polylineStr.length;
    var index = 0;
    var array = [];
    var lat = 0;
    var lng = 0;

    while (index < len) {
      var b;
      var shift = 0;
      var result = 0;
      do {
        b = polylineStr.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      var dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lat += dlat;

      shift = 0;
      result = 0;
      do {
        b = polylineStr.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      var dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lng += dlng;

      array.push([lat * 1e-5, lng * 1e-5]);
    }
    return array;
  }
});

module.exports = Route;