# 🎓 Computer_Science Mastery Assessment

> *Test your knowledge based on the core required reading materials.*

## Part I: Multiple Choice Concept Check
- Use **bold text** for the question.
- Provide 4 options (A, B, C, D) using blockquotes for readability.
- **Hide the answer** using a `<details><summary>Reveal Answer</summary>` tag immediately after the options. Include a brief explanation in the hidden section.

**1.  Which of the following best describes the primary function of the RTS/CTS mechanism?**
   > A.  Ensuring reliable delivery of packets by retransmitting lost ones.
   > B.  Minimizing collisions in wireless networks by coordinating transmission timing.
   > C.  Encrypting data packets to protect them from eavesdropping.
   > D.  Routing packets through different network paths to improve speed.

   <details>
     <summary>Reveal Answer</summary>
     <p><b>Correct Answer: B</b></p>
     <p>RTS/CTS (Request to Send/Clear to Send) is a collision avoidance mechanism used in IEEE 802.11. It prevents collisions by having a station request permission to transmit, and the network responds with a clear-to-send signal, ensuring no other station transmits simultaneously.</p>
   </details>

**2.  What is the main difference between Truyền tham chiếu (Reference Transmission) and Truyền tham trị (Value Transmission)?**
   > A.  Reference Transmission involves sending the entire object, while Value Transmission only sends a portion.
   > B.  Reference Transmission allows bidirectional access to the object, while Value Transmission is unidirectional.
   > C.  Reference Transmission is used for large files, while Value Transmission is used for small data packets.
   > D.  Reference Transmission utilizes physical hardware for data transmission, while Value Transmission relies solely on software.

   <details>
     <summary>Reveal Answer</summary>
     <p><b>Correct Answer: B</b></p>
     <p>Reference Transmission involves sending the object itself, whereas Value Transmission sends only a reference (pointer) to the object. This allows access in both directions (client to server and server to client) in Reference Transmission, while Value Transmission is typically unidirectional – from client to server.</p>
   </details>

**3.  The `ByteArrayInputStream` class in Java is primarily used for which purpose?**
   > A.  Creating a network socket for sending and receiving data.
   > B.  Reading byte arrays as a stream of bytes, enabling object deserialization.
   > C.  Implementing a secure communication protocol for data encryption.
   > D.  Managing network resources and allocating memory for network operations.

   <details>
     <summary>Reveal Answer</summary>
     <p><b>Correct Answer: B</b></p>
     <p>`ByteArrayInputStream` provides a stream interface for reading byte arrays, which is crucial for deserialization processes – converting byte streams back into Java objects (e.g., after being transmitted over a network).</p>
   </details>

**4.  What does the RFC 1288 document specify?**
    > A.  A standard for data compression algorithms.
    > B.  A Request for Comments document specifying the Finger protocol.
    > C.  A protocol for configuring DHCP servers.
    > D.  A method for securing network traffic with SSL/TLS.

    <details>
      <summary>Reveal Answer</summary>
      <p><b>Correct Answer: B</b></p>
      <p>RFC 1288 (Request for Comments) is a document that defines the Finger protocol, a method for retrieving and displaying user information from remote systems.</p>
    </details>

**5.  Which of the following best describes the role of a "TerminalConnection" in network communication?**
   > A.  It represents the physical network cable connecting two devices.
   > B.  It represents the relationship between a connection and a physical endpoint (Terminal) of a call.
   > C.  It represents the routing table maintained by a router.
   > D.  It represents the data transmitted over a TCP/IP connection.

   <details>
     <summary>Reveal Answer</summary>
     <p><b>Correct Answer: B</b></p>
     <p>A `TerminalConnection` precisely represents the link between a network connection and the physical endpoint (Terminal) used to establish that connection, describing the current state of that relationship – crucial for call management and troubleshooting.</p>
   </details>

## Part II: Formula Application & Short Answer
- Present the question clearly.
- Provide step-by-step guidance in a hidden `<details>` block.

**1.  Explain how the `Phép toán AND mức bít` (Bitwise AND Operation) is used to determine the network address from an IP address and subnet mask.**
   > Illustrate with an example: IP address = 192.168.1.100, Subnet Mask = 255.255.255.0.

   <details>
     <summary>Reveal Answer</summary>
     <p><b>Step 1: Convert IP and Mask to Binary</b>:
       192.168.1.100 = 11000000.10101000.00000001.01100100
       255.255.255.0 = 11111111.11111111.11111111.00000000
     </p>
     <p><b>Step 2: Perform Bitwise AND</b>:  Perform a bitwise AND operation between the IP address and the subnet mask. This effectively masks out the host portion of the IP address, leaving only the network address.</p>
     <p><b>Result:</b> 11000000.10101000.00000001.00000000  = 192.168.1.0 (This is the network address)</p>
     <p>In essence, the bitwise AND operation isolates the bits that are common to both the IP address and the subnet mask, defining the network portion of the address. The remaining bits represent the host address.</p>
   </details>

**2.  Describe the purpose of the `Seconds to Bytes Conversion` formula:  `time[0]= (secondsSince1900 & 0x00000000FF000000L) >> 24;` and explain the significance of each part.**
   > Explain the role of the `&` and `>>` operators.

   <details>
     <summary>Reveal Answer</summary>
     <p><b>Explanation:</b> This formula converts the number of seconds since the Unix epoch (January 1, 1970) into a 4-byte integer representation suitable for network transmission.  It's a common technique in network programming for dealing with timestamps.</p>
     <p><b>`secondsSince1900`</b>: Represents the number of seconds elapsed since January 1, 1970 (Unix epoch).</p>
     <p><b>`& 0x00000000FF000000L`</b>: This is a bitmask. `0x00000000FF000000` is a hexadecimal representation of a 32-bit number (4 bytes) where all the lower 8 bits are set to 0, and the upper 24 bits are set to 1.  The bitwise AND operation (`&`) ensures that only the lower 24 bits of `secondsSince1900` are retained. The `L` suffix indicates a long integer literal to prevent integer overflow during the bitwise AND operation.</p>
     <p><b>`>> 24`</b>: This is a right bit shift operation.  It shifts the 24 rightmost bits of the result of the AND operation to the right by 24 positions. This effectively removes the leading 24 bits, leaving only the 24 bits that represent the seconds since the epoch.</p>
   </details>

## Part III: Practical Exercise
- Define a clear scenario or problem statement.
- Ask the student to calculate a result or write a pseudo-code snippet.
- Hide the solution and explanation using a `<details>` tag.

**1. Scenario:** You are building a simple server application that accepts incoming connections on port 8080. You need to dynamically manage the IP address assigned to the server, so you're using the `ipvar` keyword in your configuration file.  The server's current IP address is `192.168.1.100`.  You also need to ensure that the server is running efficiently.

**Task:** Write a pseudo-code snippet that demonstrates how you might use the `ipvar` keyword in a `ServerSocket` configuration to set the server's IP address to `192.168.1