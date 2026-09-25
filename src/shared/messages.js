(function (root) {
  'use strict';

  var MESSAGE_TYPES = {
    GET_STATE: 'GET_STATE',
    SET_SPEED: 'SET_SPEED',
    SPEED_CHANGED: 'SPEED_CHANGED',
    // iframe -> background: "which site is this tab on?"
    GET_PAGE_HOST: 'GET_PAGE_HOST',
    // background -> the tab's top frame, fallback for GET_PAGE_HOST
    GET_FRAME_HOST: 'GET_FRAME_HOST',
  };

  root.SpeeVid = root.SpeeVid || {};
  root.SpeeVid.messages = { MESSAGE_TYPES: MESSAGE_TYPES };
})(typeof globalThis !== 'undefined' ? globalThis : this);
