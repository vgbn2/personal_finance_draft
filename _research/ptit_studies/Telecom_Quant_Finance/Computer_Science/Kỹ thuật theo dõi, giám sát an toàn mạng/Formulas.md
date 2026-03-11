# 🧮 Formulas for Kỹ thuật theo dõi, giám sát an toàn mạng

- **Sid-map**: $$sid-map$$ - A mapping of rule names to unique identifiers used by Snort.

- **Rule Update Command**: $$sudo rule-update$$ - Command to update Snort rules using PulledPork.

- **Công thức Rủi ro**: $$R = I * P$$ - Công thức tính toán rủi ro dựa trên ảnh hưởng và xác suất của nguy cơ.

- **rwfilter command**: $$rwfilter --any-address=1.2.3.4 --start-date=2013/06/22:11 --end-date=2013/06/22:16 --type=all --pass=stdout | rwcut$$ - Lệnh rwfilter với các tùy chọn để lọc luồng dữ liệu dựa trên địa chỉ IP, ngày tháng, loại luồng và chuyển hướng đầu ra.

- **data rollover command**: $$find /data/silk/* -mtime + 29 -exec rm {}$$ - Lệnh để xóa các tệp tin luồng dữ liệu cũ hơn 30 ngày trong thư mục /data/silk/.

- **Zero-copy**: $$RX_RING, TX_RING$$ - Cơ chế để đọc và ghi dữ liệu mà không cần sao chép, tăng hiệu suất.

- **ifpps**: $$ifpps -d <interface>$$ - Command to generate continuous network traffic statistics for a selected interface, including CPU, disk I/O, and system statistics.

- **Bytes per Second**: $$42.9 MB/second$$ - The rate of data flow after filtering TCP/443, calculated as 42.9 MB per second.

- **find command**: $$find /data/pcap -type f -mtime + 60$$ - Locates files in /data/pcap older than 60 minutes.

- **xargs command**: $$find /data/pcap -type f -mtime + 60 | xargs -i rm {}$$ - Executes the rm command on files identified by the find command.

- **URLsnarf**: $$sudo urlsnarf> /home/idsusr/urlsnarf.log$$ - Command to execute URLsnarf and redirect output to a log file.

- **Alert Rule Syntax**: $$alert ip any any - > any any (msg:"IPREP ..."; iprep:dst,MDL,>,75; sid:1; rev:1;)$$ - Illustrates the basic syntax of a Suricata alert rule for IP reputation, including source/destination IP, category, operator, and confidence level.

- **Snort Configuration**: $$sudo snort -c snort.conf -i eth1$$ - Command to run Snort with a specified configuration file and interface.

- **Suricata Configuration**: $$sudo suricata -c suricata.yaml -i eth1$$ - Command to run Suricata with a specified configuration file and interface.

- **SMTP AUTH LOGON brute force detection**: $$alert tcp $SMTP_SERVERS 25 -> $EXTERNAL_NET any (msg:"GPL SMTP AUTH LOGON brute force attempt"; flow:from_server,established; content:"Authentication unsuccessful"; offset:54; nocase; threshold:type threshold, track by_dst, count 5, seconds 60; classtype:suspicious-login; sid:2102275; rev:3;)"$$ - A Snort rule designed to detect SMTP AUTH LOGON brute force attacks, utilizing variables for source and destination IP addresses.

- **Portscan Preprocessor**: $$preprocessor sfportscan: proto { all } memcap { 10000000 } sense_level { low }$$ - Defines parameters for portscan detection (protocol, memory cap, sensitivity).

- **SSH Anomaly Preprocessor**: $$preprocessor ssh: server_ports {22} autodetect max_client_bytes 19600 max_encrypted_packets 20 enable_respoverflow enable_ssh1crc32 enable_srvoverflow enable_protomismatch$$ - Configures parameters for detecting SSH anomalies, including server ports and encryption features.

- **Maximum Client Bytes**: $$max_client_bytes 19600$$ - Sets the maximum size of client packets for anomaly detection.

- **rwfilter**: $$rwfilter --start-date = ... --any-address = ... --type = all --pass = stdout$$ - Lệnh để lọc dữ liệu luồng trong SiLK.

- **rwstats**: $$rwstats --top --count = 20 --fields = sip,dip --value = bytes$$ - Lệnh để phân tích dữ liệu luồng đã lọc bằng rwstats, tạo ra danh sách top 20 dựa trên byte.

- **Bin Size**: $$--bin-size = <value> (seconds)$$ - Specifies the size of time intervals for aggregation in rwcount, allowing for flexible analysis of data over different durations.

- **rwstats query**: $$rwfilter sample.rw --type = out,outweb --sport = 1-1024 --pass = stdout | rwstats --fields = sip,sport --count = 20 --value = dip-distinct$$ - A query to analyze the filtered data, extracting specific fields and counting the distinct destination IP addresses.

- **Flow Profiling**: $$N/A$$ - The document discusses using flow profiling to analyze network traffic.

- **Network Filtering**: $$N/A$$ - The document describes using commands like `rwfilter` to filter network traffic based on protocol, port, and other parameters.

- **rwfilter --start-date = 2013/09/02: 14 --proto = 0- --pass = stdout --type = all | rwcount --bin-size = 60**: $$rwfilter --start-date = 2013/09/02: 14 --proto = 0- --pass = stdout --type = all | rwcount --bin-size = 60$$ - Lệnh này sử dụng rwfilter để lọc lưu lượng mạng theo thời gian và loại, sau đó chuyển kết quả vào rwcount để đếm số lượng bản ghi trong mỗi khoảng thời gian 60 giây.

- **Time Formatting**: $$set timefmt ‘%Y/%m/%dT%H:%M:%S’$$ - Specifies the format for interpreting time values in the 'hourly.csv' file.

- **Hexadecimal Conversion**: $$01000101 -> 45$$ - Conversion of a binary byte (01000101) to its hexadecimal representation (45) by dividing into nibbles and converting each nibble to its decimal equivalent.

- **IP Header Length Calculation**: $$Length = Field_Value * 4$$ - The maximum IP header length is calculated by multiplying the value in the header length field by 4.

- **IP Header Length**: $$4 * 5 = 20 bytes$$ - The IP header length is calculated as 4 bytes (version and IHL) multiplied by 5, resulting in a total length of 20 bytes.

- **TCP Header Length**: $$5 * 4 = 20 bytes$$ - The TCP header length is calculated as 5 bytes (offset) multiplied by 4, resulting in a total length of 20 bytes.

- **TCPdump**: $$-X$$ - Một lệnh dòng lệnh để bắt và phân tích lưu lượng mạng, thường được sử dụng với Wireshark.

- **End Points**: $$Statistics -> Endpoints$$ - Tính năng trong Wireshark để phân tích lưu lượng dữ liệu liên quan đến từng thiết bị đầu cuối trong mạng.

- **NetFlow Analysis**: $$NetFlow = {Flow Data, Time Stamps, Source/Destination IPs}$$ - NetFlow analysis provides data on network traffic flows, including source and destination IP addresses and timestamps, to identify patterns and anomalies.

- **IPVoid**: $$IPVoid = {Blacklist Lookup, Threat Intelligence}$$ - IPVoid is a threat intelligence platform that performs blacklist lookups to identify potentially malicious IP addresses.