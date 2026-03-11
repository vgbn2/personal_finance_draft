# 🎓 Thuật toán và ứng dụng Mastery Assessment

> *Test your knowledge based on the core required reading materials.*

## Part I: Multiple Choice Concept Check
- **Bold text indicates the question.**
- Provide 4 options (A, B, C, D) using blockquotes for readability.
- **Hide the answer** using a `<details><summary>Reveal Answer</summary>` tag immediately after the options. Include a brief explanation in the hidden section.

**1. Which of the following BEST describes a "Thuật toán"?**
   > A.  A mathematical equation used to solve complex problems.
   > B.  A systematic procedure or sequence of steps to achieve a specific outcome.
   > C.  A graphical representation of a data structure.
   > D.  A type of computer hardware component.

   <details>
     <summary>Reveal Answer</summary>
     <p><b>B. A systematic procedure or sequence of steps to achieve a specific outcome.</b></p>
     <p>A thuật toán is fundamentally defined as a procedure or sequence of steps, making option B the most accurate description.</p>
   </details>

**2. The "Độ phức tạp thuật toán" primarily measures:**
   > A.  The physical size of the computer's memory.
   > B.  The amount of time and memory required to execute an algorithm.
   > C.  The accuracy of the algorithm's output.
   > D.  The number of lines of code in the algorithm.

   <details>
     <summary>Reveal Answer</summary>
     <p><b>B. The amount of time and memory required to execute an algorithm.</b></p>
     <p>Độ phức tạp thuật toán focuses on resource consumption, particularly time and memory, which is option B's correct response.</p>
   </details>

**3. What does the term "Back-Tracking" refer to in the context of algorithm design?**
   > A.  A method for efficiently sorting large datasets.
   > B.  A technique for systematically exploring all possible solutions by abandoning paths that lead to dead ends.
   > C.  A programming paradigm that emphasizes modularity and abstraction.
   > D.  A type of data structure used for implementing search algorithms.

   <details>
     <summary>Reveal Answer</summary>
     <p><b>B. A technique for systematically exploring all possible solutions by abandoning paths that lead to dead ends.</b></p>
     <p>Back-tracking is precisely defined as a problem-solving method that explores possibilities, discarding paths that aren't viable – hence option B.</p>
   </details>

**4. In the context of the Sudoku puzzle, what is the core technique being utilized?**
   > A.  Linear Programming.
   > B.  A recursive algorithm.
   > C.  A greedy algorithm.
   > D.  Dynamic Programming.

   <details>
     <summary>Reveal Answer</summary>
     <p><b>B. A recursive algorithm.</b></p>
     <p>Sudoku is a classic example of a problem well-suited to a recursive algorithm, backtracking to explore valid configurations. </p>
   </details>

**5. The “Greedy-Activities-Selection” algorithm aims to:**
   > A.  Find the absolute shortest possible activity duration.
   > B.  Maximize the number of activities completed, based on earliest finish times.
   > C.  Minimize the total cost of completing activities.
   > D.  Ensure that all activities are scheduled simultaneously.

   <details>
     <summary>Reveal Answer</summary>
     <p><b>B. Maximize the number of activities completed, based on earliest finish times.</b></p>
     <p>This algorithm specifically uses the criteria of selecting activities based on the earliest finish times to maximize the number of completed activities, making B the correct answer.</p>
   </details>

## Part II: Formula Application & Short Answer
Create 3 Short Answer Questions based on the formulas provided.
- Present the question clearly.
- Define a scenario where the student must use one of the provided formulas.
- Hide the step-by-step solution using a `<details><summary>Reveal Solution</summary>` block.

**1. Scenario:** You are designing a network of computers. You have a graph representing the connections between them, where each edge has a weight representing the cost of the connection. You need to find the shortest path between two computers.  Using the Floyd-Warshall Algorithm, describe the steps involved in finding the shortest paths between all pairs of computers.

<details>
  <summary>Reveal Solution</summary>
  <p>The Floyd-Warshall algorithm iteratively computes all-pairs shortest paths. It starts with a distance matrix initialized with the direct edge weights.  Then, for each node 'k', it considers 'k' as an intermediate node and updates the shortest distance between all pairs of nodes 'i' and 'j' using the formula:  `d(i, j) = min { d(i, k) + d(k, j) }`. This process repeats until no further changes occur in the distance matrix, indicating that the shortest paths have been found. This iterative approach guarantees finding the shortest paths between all pairs of nodes.</p>
</details>

**2. Scenario:**  You are scheduling a set of activities, each with a start time and finish time.  You want to select the maximum number of non-overlapping activities. You are given the "Greedy-Activities-Selection" algorithm.  Explain how you would apply this algorithm to determine the optimal set of activities to schedule.

<details>
  <summary>Reveal Solution</summary>
  <p>The Greedy-Activities-Selection algorithm sorts activities based on their finish times in ascending order. Then, it iteratively selects the activity with the earliest finish time that does not conflict with previously selected activities.  This process continues until all activities have been considered. The set of selected activities represents the OPT (optimal set) that maximizes the number of activities completed.</p>
</details>

**3. Scenario:** You are working on a problem where you need to find the number of ways to form a sum using a set of positive integers, where each integer can be used multiple times.  Describe how you would apply the formula:  `F[m, v] = F[m-1, v] + F[m, v-m]`.  Provide a specific example (e.g., finding the number of ways to form the sum of 5 using integers 1, 2, and 3).

<details>
  <summary>Reveal Solution</summary>
  <p>This formula is a core component of the dynamic programming solution to the "Bài toán cái túi (Knapsack Problem)" which is adapted here.  `F[m, v]` represents the number of ways to form the sum 'v' using integers up to 'm'. The formula states that the number of ways to form 'v' is the sum of the number of ways to form 'v' using only the first 'm' integers ( `F[m-1, v]` ) and the number of ways to form 'v' using the first 'm' integers *including* the integer 'm' itself ( `F[m, v-m]` ).  </p>
  <p><b>Example:</b>  Finding the number of ways to form the sum of 5 using integers 1, 2, and 3:
    *   `F[3, 5] = F[2, 5] + F[3, 5-3] = F[2, 5] + F[3, 2]`
        *   `F[2, 5]`: Number of ways to form 5 using 1, 2, and 3.
            *   1+1+1+1+1 = 5
            *   1+1+2+1 = 5
            *   1+1+1+2 = 5
            *   1+2+2 = 5
            *   2+3 = 5
            *   Total: 5 ways
        *   `F[3, 2]`: Number of ways to form 2 using 1, 2, and 3.
            *   2 = 2
            *   Total: 1 way
    *   Therefore, `F[3, 5] = 5 + 1 = 6`</p>
</details>
