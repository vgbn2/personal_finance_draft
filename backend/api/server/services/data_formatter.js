function formatTableRow(label, value) {
  return {
    label,
    value,
  };
}

function summarizeStatus(payload) {
  return {
    ok: Boolean(payload && payload.ok),
    degraded: Boolean(payload && payload.degraded),
    type: payload?.type || 'unknown',
  };
}

module.exports = {
  formatTableRow,
  summarizeStatus,
};
