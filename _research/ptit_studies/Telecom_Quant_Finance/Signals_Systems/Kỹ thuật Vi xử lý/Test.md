# 🎓 Kỹ thuật Vi xử lý Mastery Assessment

> *Test your knowledge based on the core required reading materials.*

## Part I: Multiple Choice Concept Check
- Use bold text for the question.
- Provide 4 options (A, B, C, D) using blockquotes for readability.
- **Hide the answer** using a `<details><summary>Reveal Answer</summary>` tag immediately after the options. Include a brief explanation in the hidden section.

**1. Which of the following best describes a Vi xử lý (Processor)?**
   > A.  A complex mathematical calculation device.
   > B.  A circuit board containing numerous integrated circuits.
   > C.  An electronic circuit that performs calculations and controls operations.
   > D.  A specialized type of memory chip.

   <details>
     <summary>Reveal Answer</summary>
     <p>C. An electronic circuit that performs calculations and controls operations.</p>
     <p>This definition aligns with the core concept of a processor as the central component within a computer system responsible for executing instructions and managing data flow. </p>
   </details>

**2. What is the primary purpose of Thumb lệnh (Thumb commands)?**
   > A.  To increase the speed of execution in high-performance systems.
   > B.  To reduce the size of compiled programs by using a smaller instruction set.
   > C.  To enable parallel processing capabilities in microcontrollers.
   > D.  To provide a more complex set of instructions for advanced programming.

   <details>
     <summary>Reveal Answer</summary>
     <p>B. To reduce the size of compiled programs by using a smaller instruction set.</p>
     <p>Thumb commands are designed to decrease code size, crucial for memory-constrained embedded systems, by utilizing a reduced instruction set.</p>
   </details>

**3.  The concept of Ngắt theo mức (Interrupts) differs from Ngắt theo điều kiện (Conditions) primarily because:**
   > A.  Both types of interrupts require the CPU to halt execution.
   > B.  Ngắt theo mức is triggered immediately upon an event, while Ngắt theo điều kiện requires a specific condition to be met.
   > C.  Ngắt theo mức is only used for hardware interrupts, while Ngắt theo điều kiện is for software interrupts.
   > D.  Ngắt theo mức is always asynchronous, while Ngắt theo điều kiện is always synchronous.

   <details>
     <summary>Reveal Answer</summary>
     <p>B. Ngắt theo mức is triggered immediately upon an event, while Ngắt theo điều kiện requires a specific condition to be met.</p>
     <p>The core difference lies in the triggering mechanism: ‘Level’ interrupts are immediate responses, while ‘Condition’ interrupts wait for a defined state.</p>
   </details>

**4.  What is the fundamental role of a CPU?**
   > A.  To provide a large amount of storage for data.
   > B.  To execute instructions and perform calculations.
   > C.  To manage the flow of electricity within a computer system.
   > D.  To connect different components of a computer network.

   <details>
     <summary>Reveal Answer</summary>
     <p>B. To execute instructions and perform calculations.</p>
     <p>The CPU is the central processing unit, responsible for carrying out the operations defined by software. </p>
   </details>

**5.  Which statement best describes the function of a Bus địa chỉ (Address Bus)?**
   > A.  It carries the data being processed by the CPU.
   > B.  It specifies the location of data within memory.
   > C.  It controls the timing of operations within the computer.
   > D.  It converts digital signals into analog signals.

   <details>
     <summary>Reveal Answer</summary>
     <p>B. It specifies the location of data within memory.</p>
     <p>The address bus transmits the memory addresses, enabling the CPU to access specific locations in RAM or ROM.</p>
   </details>

## Part II: Formula Application & Short Answer
Create 3 Short Answer Questions based on the formulas provided.
- Present the question clearly.
- Define a scenario where the student must use one of the provided formulas.
- Hide the step-by-step solution using a `<details><summary>Reveal Solution</summary>` block.

**1. Scenario:** A microcontroller is used in a system where the baud rate needs to be precisely determined for serial communication.  Calculate the baud rate if the period time is 10 microseconds. Use the formula:  `baud rate = 1 / (period time)`.

   <details>
     <summary>Reveal Solution</summary>
     <p>1. **Identify the given value:** Period time = 10 microseconds = 10 * 10<sup>-6</sup> seconds.</p>
     <p>2. **Apply the formula:** baud rate = 1 / (10 * 10<sup>-6</sup>) = 100000 baud.</p>
     <p>3. **Answer:** The baud rate is 100,000 baud.</p>
   </details>

**2. Scenario:**  You are designing an interrupt system for a microcontroller. The interrupt vector number needs to be calculated based on the interrupt number.  The interrupt number is 5.  Use the formula: `IV = (Interrupt Vector Number) = (Interrupt Number) - 1`.

   <details>
     <summary>Reveal Solution</summary>
     <p>1. **Identify the given value:** Interrupt Number = 5</p>
     <p>2. **Apply the formula:** IV = 5 - 1 = 4</p>
     <p>3. **Answer:** The interrupt vector number is 4.</p>
   </details>

**3. Scenario:** A microcontroller is timing a period using a 16-bit up-counting timer. The timer is set to count up to 65535.  What is the maximum duration (in milliseconds) that the timer can measure?

   <details>
     <summary>Reveal Solution</summary>
     <p>1. **Understand the timer range:** The timer counts up to 65535.</p>
     <p>2. **Calculate the duration:** The duration is equal to the number of clock cycles it takes to reach 65535. Since the timer counts up to 65535, the maximum duration is 65535 clock cycles.</p>
     <p>3. **Convert clock cycles to milliseconds (assuming a clock frequency of 1 MHz - 1,000,000 cycles per second):** Duration (ms) = (65535 cycles / 1,000,000 cycles/second) * 1000 milliseconds = 6.5535 ms</p>
     <p>4. **Answer:** The maximum duration is approximately 6.5535 milliseconds.</p>
   </details>
