'use strict';

/**
 * HIGH-AVAILABILITY CLUSTER OPERATIONAL CLI COMMAND
 *
 * Provides `sovereign cluster status`, `sovereign cluster elect`,
 * and `sovereign cluster doctor` diagnostics across local nodes and remote mesh peers.
 */

const A = require('../../../../shared/lib/ui/ansi');
const utils = require('../../lib/utils.js');
const { printPayload, pageText } = utils;
const { getDefaultClusterCoordinator } = require('../../../../shared/lib/runtime/cluster_coordinator.js');

async function commandCluster(args) {
  const sub = String(args[0] || 'status').toLowerCase();
  const coordinator = getDefaultClusterCoordinator();

  if (sub === 'status' || sub === 'list') {
    const nodes = coordinator.getClusterNodes();
    const leader = coordinator.getLeader();
    const remote = await coordinator.pollRemotePeers(1500);

    if (args.includes('--json')) {
      printPayload({
        ok: true,
        node_id: coordinator.nodeId,
        priority: coordinator.priority,
        role: coordinator.role,
        is_leader: coordinator.isLeader(),
        leader,
        nodes,
        remote_peers: remote,
      }, args);
      return 0;
    }

    const lines = [
      `${A.B_CYAN}SOVEREIGN CLUSTER STATUS${A.RESET}`,
      A.GRAY + '='.repeat(60) + A.RESET,
      `  Local Node ID : ${A.BOLD}${coordinator.nodeId}${A.RESET} (Priority: ${coordinator.priority})`,
      `  Local Role    : ${coordinator.role === 'leader' ? A.B_GREEN + 'LEADER' : A.YELLOW + 'FOLLOWER'}${A.RESET}`,
      `  Active Leader : ${leader ? A.GREEN + leader.leader_id + A.RESET + ` (expires in ${Math.max(0, Math.round((leader.expires_ms - Date.now()) / 1000))}s)` : A.RED + 'NONE (ELECTION REQUIRED)' + A.RESET}`,
      '',
      `${A.BOLD}Cluster Nodes (${nodes.length}):${A.RESET}`,
    ];

    for (const n of nodes) {
      const isMe = n.node_id === coordinator.nodeId;
      const statusColor = n.status === 'healthy' ? A.GREEN : A.RED;
      lines.push(`  • [${statusColor}${n.status.toUpperCase()}${A.RESET}] ${n.node_id} (prio: ${n.priority}, role: ${n.role}) ${isMe ? A.CYAN + '[SELF]' + A.RESET : ''}`);
    }

    if (remote.length) {
      lines.push('', `${A.BOLD}Remote Mesh Peers (${remote.length}):${A.RESET}`);
      for (const r of remote) {
        const icon = r.ok ? A.GREEN + 'ONLINE' : A.RED + 'OFFLINE';
        lines.push(`  • [${icon}${A.RESET}] ${r.peer} (${r.latency_ms}ms) ${r.error ? A.GRAY + `[${r.error}]` + A.RESET : ''}`);
      }
    }

    pageText(lines.join('\n'), args);
    return 0;
  }

  if (sub === 'elect' || sub === 'election') {
    const res = coordinator.evaluateElection({ force: true });
    printPayload({ ok: true, command: 'elect', result: res }, args);
    return res.ok ? 0 : 1;
  }

  if (sub === 'step_down' || sub === 'step-down') {
    const res = coordinator.stepDown();
    printPayload({ ok: true, command: 'step_down', result: res }, args);
    return res.ok ? 0 : 1;
  }

  if (sub === 'doctor') {
    const nodes = coordinator.getClusterNodes();
    const leader = coordinator.getLeader();
    const remote = await coordinator.pollRemotePeers(2000);
    const issues = [];

    if (!leader) issues.push('No active leader lease found in cluster');
    if (nodes.filter((n) => n.status === 'healthy').length < 1) {
      issues.push('Zero healthy cluster nodes reporting heartbeats');
    }
    const offlinePeers = remote.filter((r) => !r.ok);
    if (offlinePeers.length > 0) {
      issues.push(`${offlinePeers.length} remote peers unreachable: ${offlinePeers.map((p) => p.peer).join(', ')}`);
    }

    const report = {
      ok: issues.length === 0,
      healthy_nodes: nodes.filter((n) => n.status === 'healthy').length,
      leader_elected: Boolean(leader),
      leader_id: leader ? leader.leader_id : null,
      reachable_peers: remote.filter((r) => r.ok).length,
      unreachable_peers: offlinePeers.length,
      issues,
    };

    if (args.includes('--json')) {
      printPayload({ ok: report.ok, command: 'doctor', report }, args);
      return report.ok ? 0 : 1;
    }

    const lines = [
      `${A.B_CYAN}SOVEREIGN CLUSTER DOCTOR${A.RESET}`,
      A.GRAY + '='.repeat(60) + A.RESET,
      `  Cluster Health : ${report.ok ? A.B_GREEN + 'PRISTINE' : A.B_RED + 'ATTENTION REQUIRED'}${A.RESET}`,
      `  Healthy Nodes  : ${report.healthy_nodes}`,
      `  Leader Status  : ${report.leader_elected ? A.GREEN + `ELECTED (${report.leader_id})` : A.RED + 'NO ACTIVE LEADER'}${A.RESET}`,
      `  Remote Peers   : ${report.reachable_peers} online / ${report.unreachable_peers} offline`,
    ];

    if (issues.length) {
      lines.push('', `${A.RED}Issues Detected:${A.RESET}`);
      for (const issue of issues) {
        lines.push(`  - ${issue}`);
      }
    }

    pageText(lines.join('\n'), args);
    return report.ok ? 0 : 1;
  }

  printPayload({
    ok: false,
    error: `Unknown cluster subcommand: ${sub}. Available: status, elect, step-down, doctor`,
  }, args);
  return 1;
}

module.exports = { commandCluster };
