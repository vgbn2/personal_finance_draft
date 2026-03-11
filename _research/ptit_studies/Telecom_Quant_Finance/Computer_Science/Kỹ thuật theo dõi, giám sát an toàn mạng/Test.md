# 🎓 Kỹ thuật theo dõi, giám sát an toàn mạng Mastery Assessment

> *Test your knowledge based on the core required reading materials.*

## Part I: Multiple Choice Concept Check

- **1. What is the primary goal of Network Security Monitoring (NSM)?**
  A.  To automatically block all network traffic.
  B.  To create a secure DMZ for public-facing servers.
  C.  To collect and analyze network data to identify and isolate malicious activity and protect network integrity.
  D.  To configure network interfaces for optimal performance.

  <details><summary>Reveal Answer</summary>
   <p>C. To collect and analyze network data to identify and isolate malicious activity and protect network integrity.</p>
   <p>NSM is fundamentally about proactive defense through data analysis, not simply blocking traffic or configuring networks.</p>
   </details>
- **2. Which of the following best describes the function of a Security Onion installation?**
  A.  A commercial firewall solution for large enterprises.
  B.  A set of tools used to teach and learn about Network Security Monitoring.
  C.  A proprietary database for storing network traffic logs.
  D.  A hardware appliance specifically designed for intrusion detection.

  <details><summary>Reveal Answer</summary>
   <p>B. A set of tools used to teach and learn about Network Security Monitoring.</p>
   <p>Security Onion is specifically designed as a learning and teaching platform for NSM concepts.</p>
   </details>
- **3. What is the role of a 'Payload' in network traffic?**
  A.  The address of the sender of the data.
  B.  The data portion of a network packet, often containing the actual content being transmitted.
  C.  The network protocol used to transmit the data.
  D.  The encryption algorithm used to protect the data.

  <details><summary>Reveal Answer</summary>
   <p>B. The data portion of a network packet, often containing the actual content being transmitted.</p>
   <p>The payload is the core data being sent over the network connection.</p>
   </details>
- **4. According to the provided definitions, what is 'Tài sản' in the context of network security?**
  A.  A specific security protocol like TCP.
  B.  A software application designed for intrusion detection.
  C.  A comprehensive set of assets belonging to an organization, including devices, data, and people.
  D.  A method for performing a network configuration audit.

  <details><summary>Reveal Answer</summary>
   <p>C. A comprehensive set of assets belonging to an organization, including devices, data, and people.</p>
   <p>‘Tài sản’ directly translates to ‘assets’ and encompasses all elements vulnerable to attack.</p>
   </details>
- **5.  What does the formula R = I * P represent in the context of risk assessment?**
  A.  The cost of implementing a security solution.
  B.  The probability of a successful attack multiplied by the potential impact.
  C.  The maximum amount of data that can be transmitted over a network.
  D.  The level of security required for a specific application.

  <details><summary>Reveal Answer</summary>
   <p>B. The probability of a successful attack multiplied by the potential impact.</p>
   <p>This is the fundamental risk calculation formula based on the provided definitions.</p>
   </details>

## Part II: Formula Application & Short Answer

- **1. Scenario:** A company has identified a potential vulnerability in its web server. The likelihood of exploitation is estimated to be 3, and the potential impact on the company's reputation and financial stability is rated as a 5.  Using the provided formula (R = I * P), calculate the risk level.

  <details><summary>Reveal Solution</summary>
   <p>Risk (R) = Impact (I) * Probability (P)</p>
   <p>R = 5 * 3 = 15</p>
   <p>Therefore, the risk level is 15.</p>
   </details>
- **2. Question:**  Explain how the `Applied Collection Framework (ACF)` would be used to identify and address a potential security threat within a network.  Outline the four stages involved.

  <details><summary>Reveal Solution</summary>
   <p>The Applied Collection Framework (ACF) would be used to systematically identify and address a security threat through these stages:</p>
   <ol>
     <li>**Risk Identification:**  Determine potential vulnerabilities and threats within the network.</li>
     <li>**Risk Quantification:**  Assess the likelihood (P) and impact (I) of each identified threat.</li>
     <li>**Appropriate Data Source Identification:** Select the relevant network data sources (e.g., NetFlow, PCAP) to capture and analyze.</li>
     <li>**Data Selection:** Choose the specific data to collect based on the identified threats and data sources.</li>
   </ol>
   </details>
- **3. Question:**  Describe the purpose of ‘FPC’ (Full Packet Capture) and how it might be utilized in an incident response scenario involving a suspected data breach.

  <details><summary>Reveal Solution</summary>
   <p>‘FPC’ (Full Packet Capture) involves capturing the entirety of network packets transmitted between two points. In an incident response scenario, this would be invaluable for:</p>
   <ol>
     <li>Analyzing the exact communication patterns leading up to the breach.</li>
     <li>Identifying the source and destination of the malicious traffic.</li>
     <li>Determining the type of data that was compromised.</li>
     <li>Reconstructing the attack timeline.</li>
   </ol>
   </details>
