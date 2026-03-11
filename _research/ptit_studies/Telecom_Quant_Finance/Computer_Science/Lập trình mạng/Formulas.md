# 🧮 Formulas for Lập trình mạng

- **Phép toán AND mức bít**: $$IP_address AND Mask$$ - Sử dụng phép toán AND mức bít trên địa chỉ IP và mặt nạ để xác định địa chỉ mạng.

- **JDBC Connection**: $$SELECT * FROM users WHERE username = ? AND password = ?$$ - SQL query for retrieving user data from a database.

- **InetAddress.getAllByName(String name)**: $$InetAddress[] addresses = InetAddress.getAllByName(String name)$$ - Retrieves all hosts with the same name.

- **TCP Connection Establishment**: $$accept() -> Socket$$ - The accept() method creates a new socket for each incoming connection.

- **Byte Stream Handling**: $$getInputStream() / getOutputStream()$$ - These methods provide byte-level input and output streams for data transfer.

- **TCP Connection**: $$TCP connection = new Socket(host, i)$$ - Establishes a TCP connection to a server on a specific port.

- **Seconds to Bytes Conversion**: $$time[0]= (secondsSince1900 & 0x00000000FF000000L) >> 24;$$ - Converts the number of seconds since the epoch (1900) into a 4-byte array, where each byte represents a portion of the integer.

- **Area of a Circle**: $$A = πr²$$ - The area of a circle, where A is the area and r is the radius.

- **RMI URL**: $$"rmi://<host>[:port]/ObjName"$$ - URL để truy xuất đối tượng từ xa, bao gồm host, port (mặc định 1099) và tên đối tượng.

- **_Skel & _Stub**: $$ _Skel (server), _Stub (client)$$ - Đối tượng trung gian được sử dụng để đóng gói và khôi phục lời gọi phương thức từ xa.

- **Naming.bind()**: $$Naming.bind("rmi//<host>[:port]/ObjName", Obj);$$ - Method used to register a remote object with the RMI registry.

- **Derivative of x**: $$d/dx (x) = 1$$ - Fundamental derivative rule.

- **Integral of x^2**: $$∫x^2 dx = (x^3)/3 + C$$ - Basic integral calculation.

- **Matrix Multiplication**: $$A * B = C$$ - Matrix multiplication operation.

- **LTM=KTM+MH+NN**: $$LTM = KTM + MH + NN$$ - Công thức định nghĩa lập trình mạng, bao gồm kiến thức mạng truyền thông (KTM), mô hình lập trình mạng (MH), và ngôn ngữ lập trình mạng (NN).

- **Quan hệ 1-n**: $$1-n$$ - Một bản ghi trong bảng A có thể liên kết với nhiều bản ghi trong bảng B, nhưng một bản ghi trong bảng B chỉ có thể liên kết với một bản ghi trong bảng A.

- **Quan hệ n-n**: $$n-n$$ - Một bản ghi trong bảng A có thể liên kết với nhiều bản ghi trong bảng B, và một bản ghi trong bảng B có thể liên kết với nhiều bản ghi trong bảng A.

- **ResultSet**: $$ResultSet rs = stmt.executeQuery(query);$$ - Represents the result set of a SELECT query.

- **SQL SELECT with BETWEEN**: $$SELECT SUM(b.amount)FROM tblBooking a INNER JOIN tblBill b ON b.idBooking = a.id WHERE ((a.startDate BETWEEN ? AND ?) AND (a.endDate BETWEEN ? AND ?))$$ - A SQL query to calculate total income based on booking date ranges.

- **Data Transfer**: $$getInputStream() -> DataInputStream,getOutputStream() -> PrintStream$$ - Data transfer occurs through `getInputStream()` and `getOutputStream()` methods, utilizing `DataInputStream` and `PrintStream` for data handling.

- **TCP/IP**: $$N/A$$ - TCP/IP is a suite of communication protocols used to interconnect network devices.

- **Read/Write Operations**: $$inp.read() / outp.write(b)$$ - Basic byte-level read and write operations using input and output streams.

- **Time Protocol Epoch Conversion**: $$long differenceBetweenEpochs = 2208988800L;$$ - Represents the difference in seconds between the TCP time server epoch (1900) and the Java Date epoch (1970).

- **Seconds Conversion**: $$secondsSince1900 = (secondsSince1900 << 8) | raw.read();$$ - A bitwise left shift and OR operation used to read the seconds from the input stream, converting them to a long integer.

- **Time Conversion**: $$long differenceBetweenEpochs = 2208988800L;$$ - This constant represents the difference in seconds between the TCP/IP epoch (1900) and the Java Date epoch (1970).

- **Seconds Calculation**: $$long secondsSince1970 = msSince1970/1000;$$ - Calculates the number of seconds since the Java Date epoch (1970) based on milliseconds since the epoch.

- **SQL Query**: $$SELECT * FROM users WHERE username = '" + user.getUserName() + "' AND password = '" + user.getPassword() + "';$$ - A SQL query to retrieve user data from a database.

- **Checksum**: $$Checksum = H(header || data)$$ - Checksum is a value calculated over the header and data of a UDP packet to detect errors.

- **UDP Communication Model**: $$Client -> Server (Data) ; Server -> Client (Response)$$ - Illustrates the fundamental two-way communication pattern in a UDP application, where the client sends data to the server, and the server sends a response back to the client.

- **Asynchronous Channel Read**: $$Future result = clientChannel.read(buffer);$$ - Asynchronous read operation using a ByteBuffer to receive data from the client channel.

- **Hash Mapping**: $$Key -> Value$$ - A fundamental concept in DHTs, mapping a key (e.g., resource identifier) to a corresponding value (e.g., node location).

- **Routing based on Key**: $$Routing Protocol -> Key Hash -> Node Location$$ - Routing protocols within DHTs utilize hash functions to determine the optimal path to a node based on the key associated with the desired resource.

- **Brute-force attack**: $$Brute-force attack$$ - Phương pháp tấn công bằng cách thử-sai tất cả các giá trị có thể của khóa.

- **Endianness (Big/Little)**: $$Big Endian / Little Endian$$ - Different byte order representations for multi-byte data, impacting network communication.

- **retr**: $$retr +filename$$ - FTP command to retrieve a file.

- **RMI Client-Server Architecture**: $$Stub + Skeleton$$ - RMI applications utilize a Stub and Skeleton to facilitate communication between client and server.

- **RMI Protocol**: $$N/A$$ - A protocol for enabling remote method calls between Java objects.

- **WebSocket Connection**: $$N/A$$ - A persistent, bi-directional communication channel between a client and a server.

- **URI Mapping**: $$N/A$$ - The use of URI patterns within the @ServerEndpoint annotation to map URLs to specific endpoint implementations.

- **Form Submission**: $$form method="POST" action="doLogin.jsp"$$ - A form submits data to a server using the POST method, directing the data to the 'doLogin.jsp' URL.

- **Parameter Retrieval**: $$String username = (String)request.getParameter("username");$$ - Retrieves the value of the 'username' form parameter from the request object, casting the result to a String.

- **jsp:setProperty**: $$<jsp:setProperty name="tên_biến" property="*"/>$$ - Maps form data to bean attributes using the JSP taglet.

- **Session.setAttribute**: $$session.setAttribute(tên_biến, giá_trị);$$ - Method to store data in the session object.

- **Session.getAttribute**: $$session.getAttribute(tên_biến_session)$$ - Method to retrieve data from the session object, requiring type casting.

- **Server-Client Architecture**: $$Server <-> Client$$ - A fundamental network architecture where a central server manages resources and communicates with multiple client devices.

- **Game Logic**: $$Score = {1, 0.5, 0}$$ - A simple scoring model for a game where a win yields 1 point, a draw yields 0.5 points, and a loss yields 0 points.

- **Score Update**: $$Win: +1, Draw: +0.5, Lose: +0$$ - The scoring system awards points based on win/loss/draw scenarios.

- **Scoring**: $$Score = 1 for win, 0.5 for draw, 0 for loss$$ - Standard scoring system based on game outcome.

- **Time Limit**: $$t = 30s$$ - Each move has a 30-second time limit.

- **Scoring System**: $$Điểm = (2-0) hoặc (3-1-0)$$ - Scoring based on number of players in the match.