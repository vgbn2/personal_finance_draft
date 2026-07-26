#!/usr/bin/env bash
set -u

interval_seconds=2
process_limit=8
run_once=false
clear_screen=true
show_containers=false
relevant_filter='sovereign|backfill|polymarket|node|python|ollama|docker|containerd|vite|codex|steam|wine'

usage() {
  cat <<'USAGE'
usage: host_resource_monitor.sh [options]

Live, foreground-only Linux host monitor. Press Ctrl+C to stop.

options:
  --once              print one snapshot and exit
  --interval SECONDS  refresh interval (default: 2)
  --top COUNT         process rows per section (default: 8)
  --filter REGEX      relevant-application process filter
  --containers        include bounded Docker container statistics
  --no-clear          append snapshots instead of clearing the terminal
  -h, --help          show this help

Examples:
  npm run host:monitor
  npm run host:monitor -- --once --no-clear
  npm run host:monitor -- --interval 5 --containers
USAGE
}

fail() {
  printf 'host-resource-monitor: %s\n' "$1" >&2
  exit 2
}

is_positive_number() {
  awk -v value="$1" 'BEGIN { exit !(value ~ /^[0-9]+([.][0-9]+)?$/ && value > 0) }'
}

while (($# > 0)); do
  case "$1" in
    --once)
      run_once=true
      shift
      ;;
    --interval)
      (($# >= 2)) || fail '--interval requires a value'
      is_positive_number "$2" || fail '--interval must be a positive number'
      interval_seconds="$2"
      shift 2
      ;;
    --top)
      (($# >= 2)) || fail '--top requires a value'
      [[ "$2" =~ ^[1-9][0-9]*$ ]] || fail '--top must be a positive integer'
      process_limit="$2"
      shift 2
      ;;
    --filter)
      (($# >= 2)) || fail '--filter requires a value'
      relevant_filter="$2"
      shift 2
      ;;
    --containers)
      show_containers=true
      shift
      ;;
    --no-clear)
      clear_screen=false
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "unknown option: $1"
      ;;
  esac
done

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

read_cpu_totals() {
  local label user nice system idle iowait irq softirq steal guest guest_nice
  read -r label user nice system idle iowait irq softirq steal guest guest_nice < /proc/stat
  printf '%s %s\n' \
    "$((user + nice + system + idle + iowait + irq + softirq + steal))" \
    "$((idle + iowait))"
}

sample_cpu_percent() {
  local first second total_before idle_before total_after idle_after total_delta idle_delta
  first="$(read_cpu_totals)"
  sleep 0.2
  second="$(read_cpu_totals)"
  read -r total_before idle_before <<<"$first"
  read -r total_after idle_after <<<"$second"
  total_delta=$((total_after - total_before))
  idle_delta=$((idle_after - idle_before))
  awk -v total="$total_delta" -v idle="$idle_delta" \
    'BEGIN {
      value = 0
      if (total > 0) value = 100 * (total - idle) / total
      printf "%.1f", value
    }'
}

print_temperatures() {
  local thermal_path found=false
  if command_exists sensors; then
    sensors 2>/dev/null \
      | awk '/Package id 0:|Tctl:|Tdie:|edge:|Composite:/ { print "  " $0 }' \
      | head -n 8
    return
  fi
  for thermal_path in /sys/class/thermal/thermal_zone*/temp; do
    [[ -r "$thermal_path" ]] || continue
    found=true
    awk -v value="$(<"$thermal_path")" -v source="$thermal_path" \
      'BEGIN { printf "  %.1f C  %s\n", value / 1000, source }'
  done
  "$found" || printf '  unavailable (install lm-sensors for labeled temperatures)\n'
}

print_gpu() {
  local busy_path found_integrated=false
  if command_exists nvidia-smi && nvidia-smi -L >/dev/null 2>&1; then
    printf '  NVIDIA: index, name, gpu%%, memory%%, VRAM used/total, temperature, state\n'
    nvidia-smi \
      --query-gpu=index,name,utilization.gpu,utilization.memory,memory.used,memory.total,temperature.gpu,pstate \
      --format=csv,noheader 2>/dev/null \
      | sed 's/^/  /'
    local compute_processes
    compute_processes="$(
      nvidia-smi \
        --query-compute-apps=pid,process_name,used_gpu_memory \
        --format=csv,noheader 2>/dev/null || true
    )"
    if [[ -n "$compute_processes" ]]; then
      printf '  NVIDIA compute processes: PID, process, VRAM\n'
      sed 's/^/  /' <<<"$compute_processes"
    fi
  else
    printf '  NVIDIA: unavailable or driver not active\n'
  fi

  for busy_path in /sys/class/drm/card*/device/gpu_busy_percent; do
    [[ -r "$busy_path" ]] || continue
    found_integrated=true
    printf '  Integrated GPU busy: %s%% (%s)\n' "$(<"$busy_path")" "$busy_path"
  done
  "$found_integrated" || true
}

print_top_processes() {
  ps -eo pid,user,stat,%cpu,%mem,rss,etime,comm --sort=-%cpu \
    | awk -v limit="$process_limit" '
        NR == 1 {
          print
          next
        }
        $8 != "ps" && shown < limit {
          print
          shown++
        }
      '
}

print_relevant_processes() {
  ps -eo pid,user,stat,%cpu,%mem,rss,etime,comm,args --sort=-%cpu \
    | awk -v pattern="$relevant_filter" -v limit="$process_limit" '
        NR == 1 {
          printf "%7s %-10s %-5s %5s %5s %8s %12s %-20s\n",
            "PID", "USER", "STAT", "%CPU", "%MEM", "RSS", "ELAPSED", "COMMAND"
          next
        }
        $8 != "ps" && tolower($0) ~ tolower(pattern) && shown < limit {
          printf "%7s %-10s %-5s %5s %5s %8s %12s %-20s\n",
            $1, $2, $3, $4, $5, $6, $7, $8
          shown++
        }
      '
}

print_containers() {
  if ! command_exists docker; then
    printf '  Docker CLI unavailable\n'
    return
  fi
  if ! timeout 3 docker info >/dev/null 2>&1; then
    printf '  Docker daemon unavailable or current user lacks access\n'
    return
  fi
  timeout 5 docker stats --no-stream \
    --format '  {{.Name}}\tCPU {{.CPUPerc}}\tMEM {{.MemUsage}} ({{.MemPerc}})\tNET {{.NetIO}}\tPIDS {{.PIDs}}' \
    2>/dev/null || printf '  Docker statistics unavailable\n'
}

print_snapshot() {
  local cpu_percent load_values cpu_mhz
  cpu_percent="$(sample_cpu_percent)"
  load_values="$(awk '{ print $1, $2, $3 }' /proc/loadavg)"
  cpu_mhz="$(awk -F: '/cpu MHz/ { total += $2; count++ } END { if (count) printf "%.0f", total / count; else print "unknown" }' /proc/cpuinfo)"

  if [[ "$clear_screen" == true && -t 1 ]]; then
    clear
  fi

  printf 'Sovereign Host Resource Monitor  %s\n' "$(date --iso-8601=seconds)"
  printf 'Host: %s  Uptime: %s\n' "$(hostname)" "$(uptime -p 2>/dev/null || true)"
  printf 'CPU: %s%%  Average MHz: %s  Load 1/5/15m: %s  Logical CPUs: %s\n' \
    "$cpu_percent" "$cpu_mhz" "$load_values" "$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo unknown)"

  printf '\nMemory\n'
  free -h | awk '
    /^Mem:/  { printf "  RAM:  total %s  used %s  available %s  cache %s\n", $2, $3, $7, $6 }
    /^Swap:/ { printf "  Swap: total %s  used %s  free %s\n", $2, $3, $4 }
  '

  printf '\nTemperature\n'
  print_temperatures

  printf '\nGPU\n'
  print_gpu

  printf '\nDisk\n'
  df -hP / | awk 'NR == 1 || NR == 2 { print "  " $0 }'

  printf '\nTop processes (RSS is KiB)\n'
  print_top_processes

  printf '\nRelevant applications (filter: %s)\n' "$relevant_filter"
  print_relevant_processes

  if [[ "$show_containers" == true ]]; then
    printf '\nContainers\n'
    print_containers
  fi

  printf '\nRefresh: %ss  Stop: Ctrl+C\n' "$interval_seconds"
}

while true; do
  print_snapshot
  [[ "$run_once" == true ]] && break
  sleep "$interval_seconds"
done
