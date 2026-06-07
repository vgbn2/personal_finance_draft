const engine = require('./engine/engine');
const intersection = require('./intersection');
const manifest = require('./manifest');

/**
 * TUI/CLI Hybrid Module
 * 
 * This module exports the decoupled architecture for Sovereign Terminal.
 */
module.exports = {
  ...engine,
  ...intersection,
  MANIFEST: manifest,
  promptMultiSelect: engine.promptMultiSelect
};
