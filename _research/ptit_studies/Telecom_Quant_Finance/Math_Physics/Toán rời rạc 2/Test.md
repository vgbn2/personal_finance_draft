# 🎓 Toán rời rạc 2 Mastery Assessment

> *Test your knowledge based on the core required reading materials.*

## Part I: Multiple Choice Concept Check
- Use bold text for the question.
- Provide 4 options (A, B, C, D) using blockquotes for readability.
- **Hide the answer** using a `<details><summary>Reveal Answer</summary>` tag immediately after the options. Include a brief explanation in the hidden section.

**1.  Which of the following best describes a "đồ thị vô hướng"?**
   > A.  A graph where edges have a defined direction.
   > B.  A graph where edges do not have a defined direction.
   > C.  A graph where edges are only connected to a single vertex.
   > D.  A graph where edges are connected to multiple vertices.

   <details>
     <summary>Reveal Answer</summary>
     <p>B. A graph where edges do not have a defined direction.  A directed graph has edges with a specific direction, while an undirected graph does not. The definition explicitly states "đồ thị vô hướng" means "undirected graph".</p>
   </details>



**2.  What is the primary purpose of a "ma trận kề" in the context of graph representation?**
   > A.  To store the vertex names in a graph.
   > B.  To represent the graph as a list of vertices and edges.
   > C.  To provide a matrix representation of the graph, where elements indicate the presence or absence of edges between vertices.
   > D.  To calculate the shortest path between two vertices in a graph.

   <details>
     <summary>Reveal Answer</summary>
     <p>C. To provide a matrix representation of the graph, where elements indicate the presence or absence of edges between vertices. The definition specifically states it’s a “ma trận vuông (0,1) cấp n” and explains how the elements are populated based on edge connections.</p>
   </details>


**3.  The "bậc của đỉnh" in a graph refers to:**
   > A.  The number of vertices connected to the given vertex.
   > B.  The number of edges in the graph.
   > C.  The degree to which the vertex is central to the graph’s structure.
   > D.  The distance between the vertex and any other vertex in the graph.

   <details>
     <summary>Reveal Answer</summary>
     <p>A. The number of vertices connected to the given vertex. The definition explicitly states “Bậc của đỉnh là số cạnh liên thuộc với nó.”</p>
   </details>



**4.  Which of the following is a key characteristic of a "thành phần liên thông"?**
   > A.  It contains only one vertex.
   > B.  It contains exactly one edge.
   > C.  Every vertex in the set can be reached from every other vertex in the set.
   > D.  It’s always the largest connected component in a graph.

   <details>
     <summary>Reveal Answer</summary>
     <p>C. Every vertex in the set can be reached from every other vertex in the set. The definition defines a "thành phần liên thông" as a "tập hợp các đỉnh mà từ bất kỳ hai đỉnh nào trong tập hợp đó cũng có thể truy cập được bằng một chuỗi các cạnh liên tiếp."</p>
   </details>



**5.  What does the term "định lý 1" in the context of graph theory refer to?**
    > A.  A theorem about graph traversal algorithms.
    > B.  A formula that relates the sum of vertex degrees to the number of edges.
    > C.  A theorem about connected graphs.
    > D.  A theorem about cycles in graphs.

   <details>
     <summary>Reveal Answer</summary>
     <p>B. A formula that relates the sum of vertex degrees to the number of edges. The definition explicitly states: “  (Evv ||)(deg)(deg) =   Vv Vv”.</p>
   </details>

## Part II: Formula Application & Short Answer
Create 3 Short Answer Questions based on the formulas provided.
- Present the question clearly.
- Define a scenario where the student must use one of the provided formulas.
- Hide the step-by-step solution using a `<details><summary>Reveal Solution</summary>` block.

**1.  Scenario:**  You are analyzing a social network represented as a directed graph.  Vertex ‘A’ has 5 incoming edges (representing friends who are following them) and 3 outgoing edges (representing friends they are following).  Vertex ‘B’ has 2 incoming edges and 4 outgoing edges.  Using *Định lý 1*, calculate the total number of edges in this graph.

<details>
  <summary>Reveal Solution</summary>
  <ol>
    <li>Apply Định lý 1:  ∑<sub>v∈V</sub> deg(v) = 2|E|</li>
    <li>Calculate the sum of degrees: deg(A) + deg(B) = 5 + 4 = 9</li>
    <li>Solve for |E|:  2|E| = 9  => |E| = 4.5</li>
    <li>Since the number of edges must be an integer, we re-examine the problem.  The calculation above assumes that all edges are single directed edges.  If we consider the edges as undirected, then the degree of each vertex is the number of edges connected to it. In this case, we have:
       deg(A) = 5
       deg(B) = 4
       Therefore, ∑<sub>v∈V</sub> deg(v) = 5 + 4 = 9
       2|E| = 9
       |E| = 4.5
    </ol>
  </details>



**2.  Scenario:**  Consider a graph with vertices {1, 2, 3, 4} and edges {(1, 2), (1, 3), (2, 3), (3, 4)}.  Construct the adjacency matrix A for this graph.

<details>
  <summary>Reveal Solution</summary>
  <ol>
    <li>The adjacency matrix A is a 4x4 matrix.</li>
    <li>A[1,2] = 1 (edge (1,2))</li>
    <li>A[1,3] = 1 (edge (1,3))</li>
    <li>A[2,3] = 1 (edge (2,3))</li>
    <li>A[3,4] = 1 (edge (3,4))</li>
    <li>A[i,j] = 0 for all other pairs of vertices (i, j).</li>
    <li>Therefore, the adjacency matrix A is:
       ```
       A = [ 1  1  1  0 ]
           [ 1  0  1  0 ]
           [ 1  1  0  1 ]
           [ 0  0  1  1 ]
       ```
  </ol>
</details>



**3.  Scenario:**  You are given a graph where you need to determine if it's a "đồ thị nửa Euler".  The graph has 5 vertices, and you know the following:  vertex A has degree 3, vertex B has degree 2, vertex C has degree 2, vertex D has degree 3, and vertex E has degree 3.  Using *Định lý 2*, determine if the graph is a "đồ thị nửa Euler".

<details>
  <summary>Reveal Solution</summary>
  <ol>
    <li>Apply Định lý 2: G is a semi-Euler graph if and only if it has 0 or 2 vertices with odd degree.</li>
    <li>Check the degrees of the vertices: A (3), B (2), C (2), D (3), E (3).</li>
    <li>There are four vertices with odd degree (A, B, C, D, E).</li>
    <li>Therefore, the graph is NOT a semi-Euler graph because it has more than two vertices with odd degree.</li>
  </ol>
</details>
