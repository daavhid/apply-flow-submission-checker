/* Shared release default. This public address contains no credentials. */
(function(root){
  'use strict';
  const value=Object.freeze({apiOrigin:'https://applyflow-api.jhproit.com'});
  root.SQCConnectionDefaults=value;
  if(typeof module!=='undefined')module.exports=value;
})(globalThis);
