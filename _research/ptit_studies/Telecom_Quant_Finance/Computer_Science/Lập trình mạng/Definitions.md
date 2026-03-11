# 📖 Definitions for Lập trình mạng

- **Mạng máy tính**: Một hệ thống kết nối các thiết bị điện tử để trao đổi dữ liệu.

- **Giao thức truyền thông**: Một tập hợp các quy tắc được sử dụng để truyền dữ liệu qua mạng.

- **Mô hình OSI/ISO**: Một mô hình phân tầng để mô tả quá trình truyền dữ liệu trên mạng, bao gồm các lớp khác nhau với chức năng riêng.

- **TCP**: Giao thức truyền thông khiển (Transmission Control Protocol), một giao thức hướng kết nối được sử dụng rộng rãi trong Internet.

- **Địa chỉ IP**: Định danh một thiết bị trên mạng, sử dụng IPv4 hoặc IPv6.

- **Mặt nạ (mask)**: Giá trị hằng nhị phân dùng để phân tách địa chỉ mạng từ địa chỉ host.

- **Địa chỉ Loopback**: Địa chỉ mạng 127.0.0.1, dùng để thử ứng dụng mạng trên cùng một máy, gói tin không truyền ra khỏi máy.

- **Địa chỉ riêng**: Các khối địa chỉ được quy định chỉ dùng cho mạng cục bộ, bị loại bỏ trên Internet.  Ví dụ: Lớp A: 10.0.0.0 -> 10.255.255.255.

- **Socket**: A communication interface and a communication structure that acts as an endpoint for communication. It consists of an IP address and a port address.

- **Address Socket**: A combination of an IP address and a port address, uniquely identifying a communication endpoint.

- **Chương trình client**: Một chương trình chạy trên máy cục bộ, đưa ra yêu cầu dịch vụ đối với server, có thời gian chạy hữu hạn.

- **Chương trình server**: Một chương trình có thời gian chạy vô tận, dừng chạy khi người dùng tắt máy tính, và chờ yêu cầu từ client.

- **Java**: A platform-independent, object-oriented programming language widely used for developing network applications.

- **JVM**: Java Virtual Machine, a software implementation of a virtual machine that enables a computer to run Java programs.

- **Model (M)**: Represents data and business logic; often referred to as an entity or bean.

- **View (V)**: Responsible for displaying data to the user, such as a form or interface.

- **MVC**: Mô hình chia ứng dụng thành ba phần: Model, View, và Controller.

- **LoginListener**: Lớp nội tại xử lý sự kiện đăng nhập.

- **ActionListener**: An interface in Java Swing that allows a component to respond to user actions.

- **InetAddress**: A Java class that represents an IP address, allowing for conversion between IP addresses and hostnames.

- **UnknownHostException**: An exception thrown when a hostname cannot be resolved to an IP address.

- **InetAddress.getAllByName()**: Returns an array of InetAddress objects representing all hosts with the same name on the network.

- **InetAddress.getByName()**: Returns an InetAddress object representing a host by its name. Throws UnknownHostException if the host does not exist.

- **Wildcard address**: An IPv4 address (0.0.0.0) or IPv6 address (0:0:0:0:0:0:0:0) that matches any address within a local network.

- **Loopback address**: A special IP address (127.0.0.1 for IPv4, 0:0:0:0:0:0:0:1 for IPv6) used for testing and debugging network applications.

- **ServerSocket**: A class that allows the creation of server-side sockets and communication using the TCP protocol. It operates in a passive listening state until a client connection is established.

- **Finger Protocol**: A protocol for transmitting data directly according to RFC 1288, where the client establishes a TCP connection to the server on port 79 and sends an online query to the server.

- **Epoch**: A reference point in time, typically the start of the Unix epoch (January 1, 1970, 00:00:00 UTC).

- **TCP/IP**: Transmission Control Protocol/Internet Protocol, a suite of protocols for communication over a network.

- **ObjectInputStream**: A class that allows you to read objects from an input stream.

- **ObjectOutputStream**: A class that allows you to write objects to an output stream.

- **DatagramPacket**: A class representing a UDP packet, containing address, data, size, and port number.

- **DatagramSocket**: A socket class for UDP communication, allowing sending and receiving DatagramPacket objects.

- **Network Interface Card (NIC)**: Điểm liên kết giữa máy tính với mạng, có thể là vật lý hoặc phần mềm (ví dụ: giao tiếp loopback)

- **NetworkInterface**: A class representing a network interface, either physical or software-based. Provides methods to interact with network connections.

- **Enumeration**: A Java interface representing a collection of elements that can be traversed sequentially.

- **UDP**: User Datagram Protocol: A connectionless protocol used for sending data packets over the internet.

- **MVC (Model-View-Controller)**: A software design pattern that separates an application into three interconnected parts.

- **UDP (User Datagram Protocol)**: A connectionless protocol used for sending data packets over a network.

- **MulticastSocket**: A Java class extending DatagramSocket, enabling multicast communication by grouping multiple stations on the Internet.

- **Multicast**: A network communication technique that allows a single sender to transmit data to a group of receivers simultaneously using multicast addresses.

- **Server hướng kết nối đồng thời**: Một loại server chuẩn sử dụng giao thức TCP, phục vụ nhiều client đồng thời bằng cách duy trì kết nối riêng với mỗi client.

- **Server lặp hướng không kết nối**: Một loại server sử dụng giao thức UDP, xử lý mỗi yêu cầu một lần.

- **Bộ đệm (Buffer)**: Một vùng nhớ tạm thời được sử dụng để lưu trữ dữ liệu truyền trong quá trình xử lý.

- **Luồng (Thread)**: Đơn vị nhỏ nhất của đoạn mã có thể thi hành riêng biệt.

- **Đa luồng (MultiThread)**: Khả năng của Java và JVM trong việc làm việc với nhiều luồng đồng thời.

- **Luồng chính (Main Thread)**: Luồng được khởi tạo ngay khi chương trình chạy và kết thúc sau cùng.

- **Quyền ưu tiên (Priority)**: Quyền ưu tiên của luồng được xác định trong khoảng từ Thread.MIN_PRIORITY đến Thread.MAX_PRIORITY, ảnh hưởng đến thời gian thực thi của luồng.

- **Monitor**: A special mechanism in Java used to resolve concurrency issues, particularly those related to synchronization and shared resource access.

- **Đầu cuối**: Tổ hợp của bàn phím và màn hình, cho phép người dùng nhập dữ liệu và nhận kết quả.

- **Đầu cuối ảo**: Kết nối mạng Internet với máy tính từ xa, đóng vai trò như một đầu cuối cục bộ trên máy tính từ xa.

- **NVT-ASCII**: A 7-bit character set used for encoding characters during Telnet communication.

- **Telnet**: A terminal network protocol enabling remote login and command execution over TCP/IP.

- **NVT (Network Virtual Terminal)**: A common interface defined by Telnet for communication between local and remote computers in heterogeneous networks, comprising data and control character sets.

- **Data Character Set**: Characters with the most significant bit set to 0 and codes within the range [0, 127].

- **Half-duplex**: A communication mode where only one party can transmit at a time.

- **Full-duplex**: A communication mode where both parties can transmit and receive simultaneously.

- **Kết nối điều khiển**: Kết nối TCP sử dụng phương thức truyền thông đơn giản để truyền lệnh và đáp ứng giữa FTPClient và FTPServer.

- **Kết nối dữ liệu**: Kết nối TCP sử dụng phương thức truyền thông phức tạp để truyền dữ liệu tệp giữa FTPClient và FTPServer.

- **FTP Server**: A server that executes FTP commands received from a client and returns responses.

- **FTP Response**: A response sent from the FTP server to the client after executing an FTP command.

- **SMTP (Simple Mail Transfer Protocol)**: A protocol for reliable and efficient email transmission, relying on a two-way communication channel between sender and receiver.

- **FTP (File Transfer Protocol)**: A protocol for transferring files between computers over a network.

- **SMTP Session**: A communication session established between an email client and a mail server, involving commands and data transfer.

- **Mail Data Buffer**: A buffer used to store the email data transmitted during an SMTP session, managed by reverse-path and forward-path buffers.

- **MAIL FROM**: A command to specify the sender's email address.

- **RCPT TO**: A command to specify the recipient's email address.

- **USER**: A POP3 server authentication command requiring the user's login credentials.

- **PASS**: A POP3 server authentication command requiring the user's password.

- **Remote Method Invocation (RMI)**: A technique for invoking methods of objects located on a remote computer via a network, returning the result to the client.

- **RPC (Remote Procedure Call)**: A technique for invoking procedures on a remote computer via a network, returning the result to the client.

- **RMI**: Remote Method Invocation - Cơ chế để xây dựng các ứng dụng phân tán dưới ngôn ngữ Java, cho phép kích hoạt các phương thức ở xa trên Server.

- **JRMI**: Java Remote Method Interface - Giao thức truyền thông trong suốt, tạo môi trường mạng để lời gọi phương thức từ xa tương tự lời gọi cục bộ.

- **Naming Service**: A service that maintains references to remote objects, enabling clients to locate and access them.

- **Registry Server**: A server that stores and manages names and references to remote objects, facilitating their discovery and invocation.

- **Remote Object**: An object that can be accessed remotely via RMI.

- **Remote Interface**: An interface defining methods that can be invoked remotely by clients.

- **RemoteException**: An exception thrown by remote method calls in RMI, indicating a problem during communication or execution.

- **UnicastRemoteObject**: A class used in RMI to export remote objects, providing the necessary infrastructure for remote method calls.

- **Bytecode**: Intermediate code generated by the Java compiler, executed by the Java Virtual Machine (JVM).

- **RMI (Remote Method Invocation)**: A Java technology that allows Java objects to be invoked on another JVM.

- **Truyền tham trị**: Truyền đối tượng qua mạng sao cho bản thân đối tượng được truyền. Hạn chế tốc độ và chỉ cho phép truy xuất một chiều.

- **Truyền tham chiếu**: Truyền tham chiếu đến đối tượng, cho phép truy xuất theo cả hai chiều từ client đến server và ngược lại.

- **rmiregistry**: A Java Virtual Machine (JVM) component that maintains a central directory of remote objects.

- **Factory Object**: An object responsible for creating and registering other objects, simplifying object management for clients.

- **JTextField**: A Swing component for displaying and editing single lines of text.

- **JPasswordField**: A Swing component for displaying and editing passwords, masking the characters.

- **FlowLayout**: A layout manager arranging components in a row, from left to right.

- **Registry**: A central service used to locate and access remote Java objects.

- **Private Data**: A package enabling applications to transmit data directly over hard switches, instructing the switch to perform a specific switch operation.

- **JTAPI**: A library designed to create an interface for Java applications to communicate with telephone systems, defining the control level an application must have.

- **Đối tượng kết nối (Connection object)**: Đại diện cho một kết nối giữa hai thiết bị đầu cuối trong cuộc gọi.

- **Đối tượng thiết bị đầu cuối (Terminal object)**: Đại diện cho một thiết bị đầu cuối tham gia vào cuộc gọi.

- **Address**: Represents a phone number, a logical endpoint of a phone call.

- **Terminal**: A physical device like a phone with associated attributes, linked to one or more Address objects (phone numbers).

- **TerminalConnection**: Represents the relationship between a connection and a physical endpoint of a call represented by a Terminal, describing the current state of the relationship.

- **IDLE**: Trạng thái khởi đầu cho mọi cuộc gọi, không có kết nối nào.

- **Active**: Trạng thái khi một cuộc gọi đang diễn ra, có kết nối.

- **JTAPI Peer**: A component that facilitates communication between telephony systems using the JTAPI protocol.

- **CallObserver**: An interface that allows a component to receive notifications about changes in a Call object.

- **DialUpManager**: A class responsible for managing dial-up connections and handling dialing states.

- **DefaultListModel**: A model used to store and manage a list of elements in a JList.

- **BorderLayout**: A layout manager that divides a component into five regions: North, South, East, West, and Center.  Allows for flexible arrangement of components within these regions.

- **JList**: A component for displaying a list of items to the user.

- **SSL (Secure Socket Layer)**: Giao thức đa mục đích tạo giao tiếp an toàn giữa các ứng dụng trên Internet, mã hóa thông tin.

- **Key**: Thông tin dùng để mã hóa hoặc giải mã thông tin, tương tự như mật khẩu.

- **Session Key**: Một khóa bí mật được tạo ra trong quá trình trao đổi thông tin giữa hai ứng dụng, dùng để mã hóa dữ liệu trong phiên làm việc đó.

- **Digital Certificate**: Một tài liệu chứa thông tin về một ứng dụng (ví dụ: web server) và được ký bởi một Cơ quan Chứng nhận (CA) để xác minh danh tính của ứng dụng.

- **SSL/TLS**: Secure Socket Layer/Transport Layer Security, protocols for secure communication.

- **SSLSocket**: Java class representing a secure socket connection using SSL.

- **genkey**: Lệnh để tạo key.

- **keystore**: Tên của key store, trong trường hợp này là mySrvKeystore.

- **OSI Model**: A conceptual framework for network communication, dividing network processes into seven layers.

- **Lập trình hướng đối tượng**: Một paradigm lập trình tập trung vào khái niệm 'object' để xây dựng phần mềm.

- **Mô hình MVC**: Một kiến trúc phần mềm chia ứng dụng thành ba thành phần chính: Model, View, và Controller.

- **Địa chỉ Broadcast trực tiếp**: Địa chỉ đích có phần netid của mạng, các bít phần hostid đều có giá trị 1.

- **Client/Server**: A network application organization model where a server provides services to clients.

- **Peer-to-Peer**: A network application model where programs can act as both server and client simultaneously.

- **Webserver**: A server that responds to requests from web browsers.

- **Socket Programming**: A technique where application programs are built using different socket types, providing loose relationships between programs due to the socket interface being a network interface.

- **Distributed Programming**: A technique where client and server relationships are tightly coupled, utilizing distributed object programming to distribute computation across connected computers for large-scale, real-time problem-solving.

- **Scanner**: A class in Java used for reading data into a program from various input sources like files or streams.

- **InputStream**: An abstract class representing an input stream, used for reading data from a source.

- **BufferedInputStream**: A class inheriting from InputStream, providing methods for efficient data input.

- **DataInputStream**: A class inheriting from InputStream, offering specialized methods for reading primitive data types.

- **Reader**: An abstract class providing methods for reading data, used as a base for Reader subclasses.

- **BufferedReader**: A class inheriting from Reader, offering additional methods for data reading.

- **OutputStream**: An abstract class representing a stream for outputting data.  It provides methods for writing data to the stream.

- **Writer**: A class abstract to write data to a stream.

- **BufferedWriter**: A class inheriting from Writer, providing additional methods for data output.

- **OutputStreamWriter**: A class inheriting from Writer, providing methods for data output, particularly handling character streams.

- **Thread**: A concurrent execution unit within a Java program, capable of running independently and potentially in parallel.

- **Runnable**: An interface in Java that defines the behavior of a thread.

- **CSDL**: Cơ sở dữ liệu - A database system comprising a collection of structured information.

- **Khóa chính**: Primary Key - A unique identifier for each record in a table.

- **Chuẩn hóa 3NF**: Một cơ sở dữ liệu được chuẩn hóa ở mức 3NF đảm bảo rằng không có phụ thuộc không tuyến tính nào từ các thuộc tính không khóa đến các thuộc tính của bảng.

- **Khóa ngoài**: Một khóa ngoài (foreign key) là một cột trong một bảng tham chiếu đến khóa chính (primary key) của một bảng khác.

- **SQL LIKE**: A SQL operator used for pattern matching within strings.

- **JDBC**: Java Database Connectivity, a specification for accessing databases from Java applications.

- **Statement**: An object representing a SQL query to be executed.

- **PreparedStatement**: An object representing a SQL query with placeholders for parameters, enhancing security and performance.

- **ResultSet**: Đối tượng trong Java đại diện cho kết quả của một câu truy vấn SQL, lưu trữ dữ liệu dưới dạng một bảng trong bộ nhớ.

- **IP Header Length (IHL)**: The length of the IP header.

- **Checksum Header**: A checksum used to verify the integrity of the IP header.

- **DataOutputStream**: A class for writing data to a stream, typically used for sending data over a network.

- **RFC 1288**: A Request for Comments document specifying the Finger protocol.

- **JFrame**: A top-level window in Java Swing.

- **Serializable**: An interface in Java that allows objects to be serialized (converted into a byte stream) and deserialized (converted back into an object) for transmission over a network or storage.

- **End-to-end connections**: Connections that ensure data is transmitted from one end to the other, focusing on direct transfer rather than intermediate routing.

- **Reliability**: The ability of a protocol to ensure data is transmitted correctly, often through mechanisms like error checking and retransmission.

- **outBuffer**: The buffer used to store outgoing data for a UDP packet, typically matching the packet's length.

- **ObjectInputStream/ObjectOutputStream**: Classes for serializing and deserializing Java objects for transmission over a network stream, enabling the exchange of complex data structures in UDP communication.

- **ByteArrayInputStream**: A class that allows reading byte arrays as a stream of bytes, enabling object deserialization.

- **Không chặn dừng**: Một mô hình lập trình mạng trong đó các hoạt động I/O không chặn CPU, cho phép CPU tiếp tục thực hiện các tác vụ khác trong khi chờ đợi dữ liệu I/O.

- **Buffer**: Một vùng bộ nhớ được sử dụng để tạm thời lưu trữ dữ liệu trong quá trình truyền hoặc xử lý I/O.

- **Mark**: Index of the position where the buffer will be reset when the reset() method is called.

- **Final Buffer reset()**: Resets the current position of the buffer and the previously set marker position.

- **BufferUnderflowException**: Exception thrown when attempting to read from a buffer when it is empty.

- **Channel**: A channel represents an open connection to a source or destination for input/output. It facilitates efficient data transmission between buffers and I/O services based on the operating system.

- **ByteBuffer**: A buffer used for storing and manipulating data during I/O operations.

- **NonReadableChannelException**: An exception thrown when a channel cannot be read; caused by channel being closed or not open for reading.

- **InterruptibleChannel**: An interface implemented by ServerSocketChannel, SocketChannel, and DatagramChannel, enabling interruption of operations.

- **SelectableChannel**: A channel class that allows sockets to operate in either blocking or non-blocking mode.

- **ServerSocketChannel**: A channel class used for server-side socket communication.

- **AsynchronousServerSocketChannel**: A socket channel that allows non-blocking operations, enabling the server to handle multiple client connections concurrently without blocking.

- **AsynchronousSocketChannel**: A channel for asynchronous communication, allowing non-blocking communication between applications.

- **Giao diện mạng**: Điểm kết nối giữa một máy tính và một mạng, có thể là vật lý hoặc phần mềm.

- **Giao diện loopback**: Một phần mềm mô phỏng giao diện mạng, thường được sử dụng trong môi trường thử nghiệm (127.0.0.1 hoặc ::1).

- **SocketException**: An exception raised during socket operations due to errors.

- **MTU (Maximum Transmission Unit)**: The largest size of data packet that can be transmitted over a network connection.

- **P2P Network**: A decentralized, self-organizing network architecture where nodes act as both clients and servers, without a central authority.

- **Distributed Hash Table (DHT)**: A decentralized system for mapping keys to values across a network of computers, providing efficient lookup and storage.

- **Peer-to-Peer (P2P)**: A distributed computing architecture where computers share resources directly with each other without the need for a central server.

- **Distributed Computing**: A computing paradigm that involves breaking down a complex problem into smaller tasks that are solved concurrently on multiple computers.

- **DHT (Distributed Hash Table)**: A distributed data structure that maps keys to values across multiple nodes in a network, enabling efficient resource location.

- **Pastry**: A routing protocol utilizing a hash table to determine message delivery paths between nodes in a P2P network.

- **Không gian khóa**: Một tập hợp các chuỗi 160-bit (khóa) được sử dụng để xác định một phần tử.

- **Thông báo băm**: Giá trị băm 160 bit được tạo ra bởi thuật toán băm, thường được gọi là tóm lược thông báo.

- **P2P**: Peer-to-Peer - Một mô hình mạng mà các máy tính trong mạng đều có thể đóng vai trò là máy chủ và khách.

- **NodeIdFactory**: A factory for generating unique Node IDs.

- **LeafSet**: A set of nodes that a node can directly contact within the P2P network.

- **InetSocketAddress**: A combination of an InetAddress (IP address) and a port number, representing a network endpoint.

- **PastryNode**: A node within the Pastry distributed system, responsible for routing messages and maintaining the network topology.

- **NodeHandle**: A unique identifier for a node in the FreePastry network.

- **PastryMessage**: A message object used for communication within the FreePastry network, containing source and destination node IDs.

- **TTL**: Time To Live - A value that determines the maximum number of hops a multicast packet can take before being discarded.

- **SSL**: Secure Sockets Layer, a protocol developed by Microsoft, also used in Windows NT networks. It is based on the Transport Layer Security (TLS) protocol defined by the Internet Engineering Task Force (IETF).

- **Mã hóa bằng khóa đối xứng**: Phương pháp mã hóa sử dụng cùng một khóa để mã hóa và giải mã.

- **Cặp khóa chung – khóa riêng**: Một cặp khóa bao gồm khóa chung (public key) dùng để mã hóa và khóa riêng (private key) dùng để giải mã.

- **SSL Protocol**: A protocol designed independently of the application layer to ensure confidentiality, security, and authentication of data streams between applications.

- **Chứng chỉ điện tử**: Bằng chứng nhận dạng (identity) cho các giao dịch trên mạng, được phát hành bởi các tổ chức độc lập.

- **Tấn công vét cạn (Brute-force attack)**: Phương pháp thử-sai miền không gian các giá trị có thể của khoá.

- **SSLEngine**: Java class providing the core SSL/TLS functionality for handling secure connections.

- **RSA**: Thuật toán mã hóa sử dụng để tạo và quản lý key, thường là RSA.

- **Big Endian**: A byte order in which the most significant byte is stored first in memory.

- **Little Endian**: A byte order in which the least significant byte is stored first in memory.

- **Java Native Interface (JNI)**: A Java API that allows Java code to interact with native code (e.g., C/C++).

- **JNI (Java Native Interface)**: An API that provides access to C/C++ code from Java.

- **IPEndPoint**: Represents an Internet address (IP address and port number) used for establishing network connections.

- **IAC**: Control Escape character, a special byte (0x7E) used in Telnet to signal commands and control operations.

- **CR-LF**: Carriage Return and Line Feed, a sequence of bytes used to signify the end of a line in text-based protocols like Telnet.

- **FTPClient**: A software application installed on the local machine used to initiate and control the FTP connection.

- **FTP**: File Transfer Protocol, a network protocol used for transferring files between a client and a server.

- **SMTP**: Simple Mail Transfer Protocol, a protocol for sending email messages between servers.

- **POP3 (Post Office Protocol Version 3)**: A protocol for accessing email, utilizing a server and client to retrieve email messages.

- **RPC**: Remote Procedure Call - Kỹ thuật lập trình phân tán cho phép gọi thủ tục từ xa.

- **Object Serialization**: The process of converting an object into a byte stream for transmission over a network.

- **WebSocket**: A protocol providing a full-duplex communication channel between a client and a server.

- **Upgrade: websocket**: A HTTP header indicating a request to upgrade an existing HTTP connection to a WebSocket connection.

- **Sec-WebSocket-Key**: A unique cryptographic key used for establishing a WebSocket connection, generated by both client and server.

- **Sec-WebSocket-Accept**: A header value generated by the server that must match the value generated by the client to successfully establish a WebSocket connection.

- **Session**: Represents the communication channel between an endpoint and remote endpoints.

- **EndpointConfig**: Configuration object used to configure an endpoint, providing settings like the URL and other relevant parameters.

- **RemoteEndpoint**: Represents a connection, providing methods for sending messages via Basic or Async interfaces.

- **OnMessage**: @OnMessage is a JSR-356 annotation used to define a method that handles incoming messages in a WebSocket endpoint.

- **Encoder**: An API component that converts Java objects into a format suitable for transmission as WebSocket messages (e.g., JSON, XML, binary).

- **Decoder**: A component that converts a message from one format to another (e.g., text to binary).

- **ServerEndpointConfig**: A class extending `ServerEndpointConfig.Configurator` used to customize WebSocket endpoint configuration, allowing for modifications like handshake handling and request property access.

- **HandshakeRequest**: An object representing the initial handshake request for a WebSocket connection, containing details like headers.

- **CDI (Contexts and Dependency Injection)**: A specification for building loosely coupled, testable, and deployable Java components.

- **ManagedExecutorService**: A service for executing tasks in a thread pool, used to prevent blocking operations in WebSocket endpoints.

- **Concurrency Utilities**: A collection of tools and libraries for managing concurrent operations in Java EE.

- **JSON**: JavaScript Object Notation, a lightweight data-interchange format.

- **JSP**: JavaServer Pages, a technology that allows developers to create dynamic web content using HTML, XML, or other formats.

- **Servlet**: A Java program that serves as the foundation for web applications, generated during the JSP compilation process.

- **JSP (JavaServer Pages)**: A technology that allows developers to embed Java code within HTML pages, enabling dynamic content generation.

- **request.getParameter()**: A method in Java Servlets that retrieves data submitted via an HTML form. It returns a String representing the value of the form parameter.

- **Bean**: A Java class that represents a data entity, often used in JSP applications to encapsulate data and provide access methods (get/set).

- **sendRedirect**: A method of the `response` object used to redirect the user to a different URL.

- **Spring Framework**: Một cấu trúc dùng để xây dựng chương trình ứng dụng web mã nguồn mở dành cho ngôn ngữ lập trình Java, theo mô hình MVC và nền tảng J2EE.

- **IoC Container**: Phần quan trọng nhất và nền tảng của Spring, giữ vai trò về cấu hình và quản lý lifecycle của các java object.

- **DispatcherServlet**: A servlet that dispatches incoming requests to the appropriate controller based on the request mapping.

- **ModelAndView**: An object used by Spring MVC controllers to return both model data and the view name to the dispatcher.

- **JdbcTemplate**: A class in Spring that provides a convenient way to execute SQL queries and operations against a database.

- **RowMapper**: An interface in Spring that allows you to map the results of a SQL query to Java objects.

- **Spring MVC**: A framework for building web applications.

- **Trạng thái**: Cho biết người chơi đang bận (chơi với người khác) hoặc rỗi (không chơi với ai).

- **Server**: Hệ thống trung tâm quản lý dữ liệu và điều khiển trò chơi.

- **Client**: Individual machine used by a player to interact with the server.

- **Người chơi**: An individual participant in the game.

- **Trắc nghiệm**: A multiple-choice question format.

- **Bàn chơi**: The game interface, comprising the playing surface and an exit button.

- **Tường nhà**: Personal homepage/timeline for each user.

- **Inactive**: State indicating a user is not actively participating (unable to click).