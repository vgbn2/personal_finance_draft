# 🎓 Lập trình mạng Mastery Assessment

> *Test your knowledge based on the core required reading materials.*

## Part I: Multiple Choice Concept Check
- Use bold text for the question.
- Provide 4 options (A, B, C, D) using blockquotes for readability.
- **Hide the answer** using a `<details><summary>Reveal Answer</summary>` tag immediately after the options. Include a brief explanation in the hidden section.

**1. What is the primary function of a "Địa chỉ IP"?**
   > A. To define the physical location of a device.
   > B. To identify a device on a network.
   > C. To control the flow of data within a network.
   > D. To encrypt data transmitted over the network.
   
   <details>
     <summary>Reveal Answer</summary>
     <p>B. To identify a device on a network.</p>
     <p>A Địa chỉ IP (Internet Protocol Address) là một định danh duy nhất được gán cho mỗi thiết bị tham gia vào mạng, cho phép các thiết bị khác nhận biết và giao tiếp với nó.</p>
   </details>

**2. Which of the following best describes the role of a "Chương trình server"?**
   > A.  It actively seeks out clients to connect with.
   > B.  It continuously listens for incoming requests and processes them.
   > C.  It transmits data directly to clients without any processing.
   > D.  It is a temporary program that runs only for the duration of a single connection.

   <details>
     <summary>Reveal Answer</summary>
     <p>B. It continuously listens for incoming requests and processes them.</p>
     <p>Một chương trình server thường chạy vô tận, chờ đợi các yêu cầu từ client và xử lý chúng, tạo ra một dịch vụ liên tục.</p>
   </details>

**3. What is the purpose of a "Mặt nạ (mask)" in network addressing?**
   > A.  To increase the speed of data transmission.
   > B.  To identify the specific network a device belongs to.
   > C.  To divide an IP address into network and host parts.
   > D.  To encrypt data transmitted between devices.

   <details>
     <summary>Reveal Answer</summary>
     <p>C. To divide an IP address into network and host parts.</p>
     <p>Mặt nạ (mask) được sử dụng để phân tách phần mạng (network portion) và phần host (host portion) của địa chỉ IP, cho phép xác định địa chỉ mạng và địa chỉ máy cụ thể.</p>
   </details>

**4.  What is the function of the "Địa chỉ Loopback"?**
   > A. To send data to a specific device on the internet.
   > B. To allow a program to test itself on the same machine.
   > C. To route data between different networks.
   > D. To encrypt data for secure transmission.

   <details>
     <summary>Reveal Answer</summary>
     <p>B. To allow a program to test itself on the same machine.</p>
     <p>Địa chỉ Loopback (127.0.0.1) được sử dụng để một chương trình có thể tự thử nghiệm và kiểm tra hoạt động của nó trên cùng một máy mà không cần kết nối với máy khác.</p>
   </details>

**5. Which of the following best describes the role of a "Socket"?**
    > A. A physical connection between two computers.
    > B. A communication interface that acts as an endpoint for communication.
    > C. A network security protocol.
    > D. A type of network cable.

   <details>
     <summary>Reveal Answer</summary>
     <p>B. A communication interface that acts as an endpoint for communication.</p>
     <p>Socket là giao diện truyền thông và cấu trúc truyền thông đóng vai trò là điểm cuối cho việc giao tiếp, bao gồm địa chỉ IP và địa chỉ port.</p>
   </details>

## Part II: Formula Application & Short Answer
- Present the question clearly.
- Define a scenario where the student must use one of the provided formulas.
- Hide the step-by-step solution using a `<details><summary>Reveal Solution</summary>` block.

**1. Scenario:** A network administrator needs to assign a static IP address to a server. The network uses a subnet mask of 255.255.255.0.  Calculate the network address for the server.

   <details>
     <summary>Reveal Solution</summary>
     <p><b>Formula Used:</b> Phép toán AND mức bít (IP_address AND Mask)</p>
     <p><b>Steps:</b></p>
     <ol>
       <li>IP Address: 192.168.1.100</li>
       <li>Mask: 255.255.255.0</li>
       <li>AND Operation: 192.168.1.100 AND 255.255.255.0 = 192.168.1.0</li>
     </ol>
     <p><b>Answer:</b> The network address is 192.168.1.0</p>
   </details>

**2. Scenario:** A Java application needs to connect to a remote server using RMI. The server's RMI URL is "rmi://example.com:1099/MyObject".  Describe the key components needed to establish this connection, referencing relevant definitions.

   <details>
     <summary>Reveal Solution</summary>
     <p><b>Key Components:</b></p>
     <ol>
       <li><b>RMI URL:</b> "rmi://example.com:1099/MyObject" – This specifies the location of the remote object.</li>
       <li><b>_Skel & _Stub:</b> The server will use a _Skel object (skeleton) and the client will use a _Stub object to handle the communication between the Java code and the RMI registry.</li>
       <li><b>JVM:</b> The Java Virtual Machine is required to run the Java code on both the client and server.</li>
       <li><b>Naming.bind():</b> This method is used to register the remote object with the RMI registry on the server.</li>
     </ol>
     <p><b>Relevant Definitions:</b> RMI URL, _Skel, _Stub, JVM, Naming.bind()</p>
   </details>

**3. Scenario:**  You are designing a simple TCP client that needs to send data to a server. Explain, using the TCP Connection Establishment formula, how the client would initiate a connection.

   <details>
     <summary>Reveal Solution</summary>
     <p><b>Formula Used:</b> TCP Connection Establishment:  TCP connection = new Socket(host, i)</p>
     <p><b>Steps:</b></p>
     <ol>
       <li>The client creates a new `Socket` object.</li>
       <li>The `Socket` constructor takes two arguments: the hostname (e.g., "server.example.com") and the port number (e.g., 8080) of the server.</li>
       <li>The `Socket` object then attempts to establish a TCP connection with the server at the specified address and port.</li>
       <li>Once the connection is established, the `Socket` object becomes the endpoint for sending and receiving data.</li>
     </ol>
     <p><b>Note:</b> This assumes a standard TCP connection setup.</p>
   </details>
