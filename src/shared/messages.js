(function (root) {
  'use strict';

  var MESSAGE_TYPES = {
    GET_STATE: 'GET_STATE',
    SET_SPEED: 'SET_SPEED',
  };

  root.SpeeVid = root.SpeeVid || {};
  root.SpeeVid.messages = { MESSAGE_TYPES: MESSAGE_TYPES };
})(typeof globalThis !== 'undefined' ? globalThis : this);
