'use strict';

function isConfigured() {
  return false;
}

function getClient() {
  return null;
}

async function getAuthStatus(_req) {
  return {
    ok: true,
    authenticated: false,
    configured: false,
    user: null,
  };
}

async function getDatabaseStatus(_req) {
  return {
    ok: false,
    configured: false,
    error: 'Database service not configured',
  };
}

async function recordAuditEvent(_event) {
  return {
    ok: true,
    skipped: true,
  };
}

module.exports = {
  isConfigured,
  getClient,
  getAuthStatus,
  getDatabaseStatus,
  recordAuditEvent,
};
