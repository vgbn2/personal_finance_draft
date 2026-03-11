# 🎓 Mạng Cảm Biến Mastery Assessment

> *Test your knowledge based on the core required reading materials.*

## Part I: Multiple Choice Concept Check
Create exactly 5 Multiple Choice Questions testing the provided definitions.
- Use bold text for the question.
- Provide 4 options (A, B, C, D) using blockquotes for readability.
- **Hide the answer** using a `<details><summary>Reveal Answer</summary>` tag immediately after the options. Include a brief explanation in the hidden section.

**1. What is the primary purpose of a sensor network in the context of Mạng cảm biến?**

> A. To transmit data directly to a central server without intermediate processing.
> B. To collect and process data from multiple sensors in a distributed manner.
> C. To provide a single, highly accurate measurement regardless of sensor location.
> D. To solely focus on data visualization and reporting.

<details><summary>Reveal Answer</summary>
<p><b>Correct Answer: B</b></p>
<p>Sensor networks are designed for distributed data collection. They consist of multiple sensors that gather information from their environment and then process and transmit that data, often to a central point, for further analysis. Options A, C, and D represent limitations or misinterpretations of sensor network functionality.</p>
</details>


**2. Which of the following best describes the concept of "mesh networking" within a Mạng cảm biến system?**

> A. A network topology where all nodes are directly connected to a central hub.
> B. A network topology where nodes communicate directly with each other, providing redundancy and scalability.
> C. A network topology reliant on a single, high-bandwidth connection for all data transmission.
> D. A network topology solely used for short-range communication between sensors.

<details><summary>Reveal Answer</summary>
<p><b>Correct Answer: B</b></p>
<p>Mesh networking is characterized by nodes communicating directly with multiple neighboring nodes, creating a redundant and robust network. This allows for data transmission even if some nodes fail, and it scales well with the addition of more sensors. Options A, C, and D describe alternative network topologies that are not mesh networks.</p>
</details>


**3. What is the role of a gateway in a Mạng cảm biến system?**

> A. To act as a primary sensor, collecting raw data directly from the environment.
> B. To translate data between different communication protocols used by sensors and the central system.
> C. To physically secure the sensor network from unauthorized access.
> D. To solely manage the power supply for all sensors in the network.

<details><summary>Reveal Answer</summary>
<p><b>Correct Answer: B</b></p>
<p>Gateways act as intermediaries, facilitating communication between sensors employing different protocols (e.g., Zigbee, WiFi) and the main processing unit. They perform protocol conversion and data routing, ensuring seamless data exchange.</p>
</details>


**4. What is the key advantage of using wireless sensor networks (WSNs) over traditional wired sensor systems?**

> A. WSNs are always more reliable and less susceptible to interference.
> B. WSNs offer greater flexibility in deployment, reduced installation costs, and increased scalability.
> C. WSNs require significantly more power consumption than wired systems.
> D. WSNs are inherently more secure than wired sensor networks.

<details><summary>Reveal Answer</summary>
<p><b>Correct Answer: B</b></p>
<p>The primary advantage of WSNs lies in their flexibility. Wireless deployment allows for easier placement, lower installation costs, and the ability to scale the network as needed. While reliability can vary, the core benefit is adaptability.</p>
</details>


**5.  What does "data aggregation" refer to in the context of Mạng cảm biến?**

> A. The process of encrypting sensor data for security purposes.
> B. The process of combining data from multiple sensors to reduce redundancy and improve accuracy.
> C. The physical act of installing and maintaining sensor nodes.
> D. The initial calibration of sensor readings to ensure accuracy.

<details><summary>Reveal Answer</summary>
<p><b>Correct Answer: B</b></p>
<p>Data aggregation involves consolidating data from numerous sensors, often to reduce redundancy, improve data quality, or simplify analysis.  This is a common processing step within a WSN.</p>
</details>

## Part II: Formula Application & Short Answer
Create 3 Short Answer Questions based on the formulas provided.
- Present the question clearly.
- Define a scenario where the student must use one of the provided formulas.
- Hide the step-by-step solution using a `<details><summary>Reveal Solution</summary>` block.

**1. Scenario:** A temperature sensor network is deployed to monitor the temperature of a warehouse. The sensors report temperature readings every 5 minutes.  You want to calculate the average temperature over a 24-hour period.  Assuming a constant rate of temperature change, what formula would you use to estimate the average temperature? (Assume a simplified model).

<details><summary>Reveal Solution</summary>
<p><b>Formula:</b>  Average Temperature = (Sum of all temperature readings) / (Number of readings)</p>
<p><b>Explanation:</b>  This is the fundamental formula for calculating an average. To apply it, you'd need to collect all temperature readings over the 24-hour period and then divide by the total number of readings.  The specific calculation would depend on how frequently the sensors report data.</p>
</details>


**2. Scenario:**  You are designing a sensor network to monitor soil moisture.  The sensors report data in units of percentage.  You want to determine the percentage difference between two readings taken at the same location.  What formula can you use to quantify this difference?

<details><summary>Reveal Solution</summary>
<p><b>Formula:</b> Percentage Difference = |(Reading 2 - Reading 1)| / Reading 1 * 100</p>
<p><b>Explanation:</b> This formula calculates the absolute difference between two values, expressed as a percentage of the original value (Reading 1). The absolute value ensures the difference is always positive.</p>
</details>


**3. Scenario:** A sensor network is tracking the wind speed. You need to determine if the wind speed has increased significantly from the previous measurement. You have two readings: Wind Speed 1 = 10 m/s and Wind Speed 2 = 12 m/s.  What formula would you use to calculate the percentage change in wind speed?

<details><summary>Reveal Solution</summary>
<p><b>Formula:</b> Percentage Change = [(Wind Speed 2 - Wind Speed 1) / Wind Speed 1] * 100</p>
<p><b>Explanation:</b> This formula calculates the percentage change in a value based on a before and after measurement. It helps determine the magnitude of the change relative to the initial value.</p>
</details>
