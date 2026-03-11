# 📖 Definitions for Kỹ thuật theo dõi, giám sát an toàn mạng

- **Giám sát an toàn mạng (Network Security Monitoring, NSM)**: Một chu trình giúp cá nhân và tổ chức nâng cao chất lượng bảo vệ tài sản, tập trung vào việc theo dõi và phân tích các hoạt động mạng để phát hiện và ngăn chặn các mối đe dọa.

- **Security Onion**: Một bộ công cụ hữu ích trong giảng dạy và học tập, được sử dụng để giám sát an toàn mạng.

- **NSM**: Network Security Monitoring - Giám sát an toàn mạng.

- **TCP**: Transmission Control Protocol - Giao thức điều khiển truyền thông.

- **Tài sản**: Một bộ các thiết bị thuộc trong tổ chức, bao gồm máy tính, máy chè, thiết bị mềm mại, màn hình, dữ liệu, con người, quy trình, sở hữu trí tuệ và danh tiếng.

- **Nguy cơ (rủi ro)**: Khả năng và độ tin cậy trong khai thác một lỗi hàng trong một tài sản.

- **Khai thác**: Phương pháp để một tài sản bị tấn công.

- **NSM (Network Security Monitoring)**: A process for collecting and analyzing network data to identify and isolate malicious activity and protect network integrity.

- **Payload**: The data portion of a network packet, often containing the actual content being transmitted.

- **Network Traffic**: The flow of data exchanged over a network.

- **Cấu hình giao diện**: Process of configuring network interfaces, including IP address assignment, subnet mask, default gateway, DNS server, and local domain name.

- **NSM Services**: Network Security Monitoring services, requiring automated installation and configuration within Security Onion.

- **PulledPork**: A tool used to update Snort rules from Emerging Threats.

- **Applied Collection Framework (ACF)**: A structured framework to simplify data collection, comprising four stages: risk identification, risk quantification, appropriate data source identification, and data selection.

- **Network Security Monitoring (NSM)**: A process of collecting and analyzing data to detect and respond to security threats.

- **Ảnh hưởng (I)**: Mức độ tác động của một nguy cơ đến tổ chức, thường được đo bằng thang điểm từ 1 đến 5.

- **Xác suất (P)**: Khả năng một nguy cơ xảy ra, cũng được đo bằng thang điểm từ 1 đến 5.

- **Rủi ro (R)**: Kết quả của việc nhân Ảnh hưởng (I) với Xác suất (P), thể hiện mức độ rủi ro mà một nguy cơ gây ra.

- **NIDS dựa trên chữ ký**: Network Intrusion Detection System (NIDS) sử dụng các mẫu chữ ký đã biết để phát hiện các cuộc tấn công.

- **NIDS dựa trên bất thường**: Network Intrusion Detection System (NIDS) phát hiện các hoạt động mạng bất thường so với trạng thái bình thường.

- **DMZ (Demilitarized Zone)**: A network segment that isolates public-facing servers from the internal network, providing a buffer against external threats.

- **NIDS (Network Intrusion Detection System)**: A security system that monitors network traffic for malicious activity or policy violations.

- **FPC (Full Packet Capture)**: Capture của toàn bộ gói tin, cung cấp thông tin đầy đủ về tất cả các gói dữ liệu được truyền giữa hai điểm cuối.

- **Luồng dữ liệu**: Một bản ghi tổng hợp của các gói tin, xác định bởi bộ-5 thuộc tính (IP nguồn, cổng nguồn, IP đích, cổng đích, giao thức vận chuyển).

- **SPAN port**: Một cổng mạng được cấu hình để sao chép lưu lượng mạng từ một hoặc nhiều cổng khác, thường được sử dụng để giám sát và phân tích lưu lượng.

- **NetFlow**: A protocol developed by Cisco for simplifying network traffic analysis and monitoring.

- **IPFIX**: A data-plane protocol based on a template-driven format, often used as an alternative to NetFlow.

- **In**: Di chuyển (inbound) đến một thiết bị trong nội bộ mạng.

- **Out**: Di chuyển (outbound) đến một thiết bị bên ngoài mạng.

- **Rwfilter**: Một công cụ phân tích SiLK dùng để lọc luồng dữ liệu, đặc biệt là dựa trên địa chỉ IP, ngày tháng và loại luồng.

- **Argus**: Một công cụ phân tích luồng dữ liệu mạng thời gian thực, sản phẩm của CERT-CC, theo dõi cả hai bên của cuộc hội thoại trên mạng.

- **libpcap**: Một thư viện để bắt và phân tích gói tin mạng.

- **Berkeley Packet Filter (BPF)**: Một ngôn ngữ truy vấn để lọc gói tin mạng dựa trên các tiêu chí khác nhau.

- **PCAP**: A file format used to store network traffic data, typically captured by packet sniffers like Wireshark.

- **FPC**: Firewall Packet Capture - Ghi lại gói tin tường lửa.

- **Bin-size**: Khoảng thời gian để nhóm dữ liệu, thường là giây hoặc phút.

- **HTTPS**: A secure protocol for transmitting data over the internet, employing encryption.

- **TCP/443**: A port commonly used for secure communication (HTTPS) over the TCP/IP protocol suite.

- **SSH VPN**: A secure network connection established using the SSH protocol, often used for creating virtual private networks.

- **PSTR**: Packet String Data, a selection of human-readable data extracted from FPC (Flow Packet Capture).

- **Common Log Format (CLF)**: A log format used by URLsnarf for storing HTTP request data.

- **Httpry**: A tool for capturing HTTP packets, displaying, and recording HTTP traffic. It analyzes HTTP traffic.

- **PSTR data**: Data generated by Httpry, useful for creating PSTR data.

- **PCAP file**: A file containing captured network packets, used as input for Httpry.

- **Logstash**: A popular log analysis tool for both single-line and multi-line logs in various formats, including syslog and JSON.

- **URLsnarf**: A tool for analyzing HTTP data, often faster than Logstash.

- **Kibana**: A data visualization and exploration tool that works with Logstash.

- **GROK**: A pattern parsing technology used to extract structured data from unstructured text.

- **Elasticsearch**: A distributed, RESTful search and analytics engine.

- **Indicators of Compromise (IOCs)**: Information used to objectively describe a network intrusion, independent of the platform.

- **Honeypot**: A system configured to attract and trap attackers, often containing known vulnerabilities.

- **IOC (Indicator of Compromise)**: Dữ liệu cụ thể và nhỏ, không thể chia nhỏ hơn, nhưng có ý nghĩa trong tình huống xâm nhập, ví dụ: địa chỉ IP, chuỗi văn bản, tên máy.

- **MD5 Hash**: Một hàm băm được sử dụng để tạo ra một chuỗi ký tự duy nhất từ một tệp tin, thường được sử dụng để xác định các tệp tin độc hại.

- **OpenIOC**: A framework for sharing data IOCs and signatures, initially developed by Mandiant as an open-source schema.

- **STIX**: Structured Threat Information eXpression, a community-driven, open-source project developed by MITRE for the US Department of Homeland Security, designed to standardize threat intelligence.

- **IOC (Indicators of Compromise)**: Dấu hiệu, sự cố, hoặc nguy cơ cụ thể được sử dụng để phát hiện xâm nhập.

- **Malware Domain List (MDL)**: Một danh sách cộng đồng phi thương mại chứa các tên miền và địa chỉ IP độc hại.

- **PhishTank**: A community-based, free website that allows users to share data related to phishing attacks.

- **Tracker Zeus/SpyEye**: Projects designed to track and control servers involved in the Zeus and SpyEye malware operations.

- **Danh tiếng IP**: Một thước đo về mức độ đáng tin cậy hoặc uy tín của một địa chỉ IP, thường dựa trên lịch sử hoạt động của nó.

- **Tiền xử lý danh tiếng**: Một quy trình xử lý dữ liệu trước khi áp dụng các quy tắc phát hiện xâm nhập, thường liên quan đến việc kiểm tra danh tiếng của các địa chỉ IP.

- **reputation-categories-file**: Specifies the path to a file containing definitions of reputation categories.

- **reputation-files**: Lists the specific reputation files (e.g., zeustracker.list) used for IP reputation detection.

- **IOC**: Indicators of Compromise - Chỉ báo xâm nhập

- **IDS**: Intrusion Detection System - Hệ thống phát hiện xâm nhập.

- **Runmode**: The configuration of Suricata's modules and threads, determining processing priority.

- **NSM Sensor**: Mô-đun thu thập gói tin, xử lý và phân tích lưu lượng mạng.

- **NIDS**: Network Intrusion Detection System - Hệ thống phát hiện xâm nhập mạng.

- **ipvar**: A keyword used in Snort and Suricata configuration files to define and reuse IP variables, allowing for dynamic IP address management.

- **vars**: A section in Suricata's `suricata.yaml` file used to define variables, including IP variables, for use within rules.

- **suricata.yaml**: A configuration file for Suricata, defining rule locations and output settings.

- **disablesid.conf**: A PulledPork file used to disable unwanted rules.

- **rwstats**: Một công cụ trong SiLK để phân tích dữ liệu luồng, cho phép tạo ra các số liệu thống kê và hiển thị dữ liệu theo nhiều cách.

- **rwcount**: A tool within the SiLK analysis package used to summarize SiLK log records based on time intervals.

- **rwsetbuild**: A command-line tool for building sets of IP addresses based on filtered network traffic.

- **C&C**: Command and Control - Lệnh và kiểm soát

- **NTP**: Network Time Protocol - A protocol for synchronizing the clocks of computers.

- **UDP**: User Datagram Protocol - A communication protocol used for transmitting data over the internet.

- **CSV**: Comma-Separated Values, a file format for storing tabular data.

- **Afterglow**: A Perl tool for generating graphs of links to visualize relationships between components.

- **Nibble**: Four bits within a byte, representing the high or low portion of the byte's value.

- **Hexadecimal**: Base-16 number system used to represent binary data.

- **Offset**: A relative position within a packet, starting from 0.

- **MAC Address**: A unique hardware address assigned to a network interface.

- **Ethernet**: A widely used networking technology that operates at the data link layer of the OSI model.

- **IP Header**: A header within an IP packet containing source and destination IP addresses, protocol information, and other control data.

- **TCP Header**: A header within a TCP packet containing source and destination port numbers, sequence numbers, and other control data.

- **BPF (Berkeley Packet Filter)**: A filtering mechanism used by tcpdump for packet analysis, allowing selective display of data.

- **NSM (Network Signature Management)**: Refers to the process of analyzing network traffic to identify and understand network issues or security threats.

- **Gói tin**: Một đơn vị dữ liệu được truyền qua mạng.

- **Cây giao thức**: Biểu diễn trực quan các giao thức mạng và lưu lượng dữ liệu liên quan.

- **TCP Stream**: A continuous flow of data transmitted over a TCP connection, allowing for the reconstruction of the original data stream.

- **Wireshark**: A network protocol analyzer used for capturing and examining network traffic, allowing for detailed analysis of protocols and data flows.

- **BPF Filters**: Packet capture filters using the Berkeley Packet Filter (BPF) format, used to capture data.

- **Bộ lọc hiển thị Wireshark**: A feature in Wireshark and tshark that uses protocol dissectors to capture information about individual protocol fields, operating on already captured data.

- **Tri thức về nguy cơ bảo mật và tài nguyên cần bảo vệ (Friendly and threat intelligence – TI)**: Tri thức giúp xác định các mối đe dọa bảo mật và đưa ra quyết định đúng đắn.

- **Yêu cầu**: Một bản tin yêu cầu về thông tin và ngữ cảnh, được sử dụng để tạo ra các câu hỏi phù hợp trong quá trình thu thập tri thức.

- **Nguy cơ bảo mật**: Tri thức về các mối đe dọa bảo mật tới các tài nguyên cần bảo vệ.

- **PRADS**: Một công cụ thu thập dữ liệu thụ động theo thời gian thực, thường được sử dụng để thu thập thông tin về các tài sản mạng.

- **Nmap**: Một công cụ quét mạng được sử dụng để xác định các thiết bị và dịch vụ đang chạy trên một mạng, thường được sử dụng để tạo mô hình tài nguyên mạng.

- **FIFO**: First In, First Out - Một cấu trúc dữ liệu quản lý thứ tự truy cập các phần tử.

- **Unix Timestamp**: Một số đại diện cho thời gian, thường được sử dụng trong các hệ thống máy tính.

- **Alert ID**: A unique identifier assigned to a specific security alert event.

- **Asset Report**: A Perl script that extracts asset information from PRADS log files.

- **OSINT**: Open Source Intelligence - Tri thức mã nguồn mở, thu thập từ các nguồn công khai như trang web.

- **IPVoid**: Một trang web kết hợp nhiều danh sách danh tiếng để xác định xem một địa chỉ IP hoặc tên miền có trong danh sách đó không.

- **Cuckoo Sandbox**: A sandbox environment for malware analysis, offering a controlled and isolated setting for examining malicious code.

- **Điều tra quan hệ**: A method of analyzing security incidents based on identifying linear relationships between entities, mirroring investigative techniques used by law enforcement.

- **Dương tính giả (False Positive)**: Một cảnh báo được tạo ra bởi một hệ thống an ninh, nhưng không có mối đe dọa thực tế.

- **Callback**: A recurring communication initiated by a device to another device.

- **System Analysis Process**: A structured process for investigating incidents, identifying compromised computers, and establishing relationships between them.

- **Differential Diagnosis**: A diagnostic method involving a list of potential diagnoses, systematically eliminating possibilities through testing and investigation.

- **Phần mềm độc hại**: Phần mềm được thiết kế để gây hại cho hệ thống máy tính, bao gồm virus, worm, trojan horse.

- **Liên lạc bình thường**: Hoạt động mạng thông thường, không phải do tấn công.

- **Cấu hình sai**: Lỗi trong cấu hình hệ thống dẫn đến lưu lượng truy cập không mong muốn.

- **DoD Cyber Incident and Cyber Event Categorization System**: A system for classifying cyber incidents and events based on their severity and impact.

- **Rule of 10**: A guideline for network security monitoring suggesting the collection of data 10 minutes before and after a specific event time to provide sufficient context.