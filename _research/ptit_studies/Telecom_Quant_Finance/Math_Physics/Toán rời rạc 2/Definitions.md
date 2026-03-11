# 📖 Definitions for Toán rời rạc 2

- **Toán rời rạc**: Lĩnh vực nghiên cứu và xử lý các đối tượng rời rạc, dùng để đếm các đối tượng và nghiên cứu mối quan hệ giữa các tập rời rạc.

- **Lý thuyết đồ thị**: Nghiên cứu các khái niệm, định nghĩa, thuật toán và ứng dụng liên quan đến đồ thị.

- **Đồ thị (Graph)**: Một cấu trúc dữ liệu rời rạc bao gồm các đỉnh và các cạnh nối các cặp đỉnh này.

- **Đơn đồ thị vô hướng**: Một đồ thị trong đó các cạnh không có hướng.

- **Đa đồ thị vô hướng**: Một đồ thị trong đó giữa hai đỉnh có thể có nhiều cạnh nối giữa chúng.

- **Giả đồ thị vô hướng**: Một đồ thị trong đó mỗi cạnh chỉ nối giữa hai đỉnh.

- **Đỉnh kề**: Hai đỉnh u và v của đồ thị vô hướng G =<V, E> được gọi là kề nhau nếu (u,v) là cạnh thuộc đồ thị G.

- **Bậc của đỉnh**: Bậc của đỉnh v trong đồ thị vô hướng là số cạnh liên thuộc với nó.

- **Đường đi**: Dãy các đỉnh liên tiếp trong đồ thị vô hướng, với mỗi đỉnh liên tiếp được kết nối bằng một cạnh duy nhất.

- **Đồ thị liên thông**: Đồ thị mà giữa mọi cặp đỉnh đều tồn tại một đường đi.

- **Thành phần liên thông**: Một tập hợp các đỉnh mà từ bất kỳ hai đỉnh nào trong tập hợp đó cũng có thể truy cập được bằng một chuỗi các cạnh liên tiếp.

- **Cầu**: Một cạnh trong đồ thị mà khi loại bỏ làm tăng số thành phần liên thông của đồ thị.

- **Định lý 1**:   (Evv ||)(deg)(deg) =   Vv Vv

- **Định nghĩa 1**: Đƣờng đi độ dài n từ đỉnh u đến đỉnh v trong đồ thị có hƣớng G=<V,A> là dãy x0, x1, . . ., xn , trong đó, n là số nguyên dƣơng, u = x0, v = xn, (xi, xi+1) E.

- **Đồ thị vô hướng định chiều**: Đồ thị vô hướng G=<V,E> được gọi là định chiều được nếu ta có thể biến đổi các cạnh trong G thành các cung tương ứng để nhận được một đồ thị có hướng liên thông mạnh.

- **Đồ thị đầy đủ**: Đồ thị đầy đủ n đỉnh, ký hiệu là Kn, là đơn đồ thị vô hướng mà giữa hai đỉnh bất kỳ của nó đều có cạnh nối.

- **Ma trận kề**: Một ma trận vuông (0,1) cấp n, mỗi phần tử aij bằng 1 nếu cạnh (i, j) thuộc đồ thị, bằng 0 nếu không.

- **Bán đỉnh bậc ra**: Bậc ra của một đỉnh trong đồ thị, được tính bằng tổng các phần tử của hàng tương ứng trong ma trận kề.

- **Danh sách cạnh**: Một biểu diễn đồ thị bằng danh sách các cạnh (cung) của đồ thị.

- **deg+(u)**: Số đỉnh có giá trị u thuộc cả vế phải của các cạnh.

- **deg-(u)**: Số đỉnh có giá trị u thuộc cả vế trái của các cạnh

- **Edge**: A data structure containing the start and end vertices of an edge in a graph.

- **Ke(u)**: The set of vertices adjacent to vertex u in a graph.

- **Danh sách kề**: Một biểu diễn đồ thị trong đó mỗi đỉnh được liệt kê các đỉnh liền kề của nó.

- **Mảng**: Một cấu trúc dữ liệu tổ hợp trong đó các phần tử có cùng kiểu dữ liệu được lưu trữ tại các địa chỉ bộ nhớ liên tiếp.

- **Depth First Search (DFS)**: A graph traversal algorithm that explores as far as possible along each branch before backtracking.

- **Breadth First Search (BFS)**: A graph traversal algorithm that explores all the neighbors of a vertex at the present depth prior to moving on to the next level.

- **chuaxet[]**: An array used to track visited vertices during graph traversal algorithms like DFS and BFS.

- **DFS (Depth-First Search)**: A graph traversal algorithm that explores as far as possible along each branch before backtracking.

- **Stack**: A data structure that follows the LIFO (Last-In, First-Out) principle.

- **Queue**: A data structure that follows the First-In, First-Out (FIFO) principle, used in BFS to manage the order of node visits.

- **DFS**: Depth-First Search - Duyệt theo chiều sâu, một thuật toán duyệt đồ thị.

- **BFS (Breadth-First Search)**: A graph traversal algorithm that explores all the neighbor nodes at the present depth prior to moving on to the nodes at the next depth level.

- **Strongly Connected Component**: A connected component in a directed graph where for every pair of vertices u and v, there is a path from u to v and a path from v to u.

- **ReInit()**: Resets the visited array (chuaxet[]) to indicate that all nodes are initially unvisited.

- **Thành phần liên thông mạnh của đồ thị**: Một đồ thị con của đồ thị G mà giữa hai đỉnh bất kỳ của đồ thị con đều có đường đi.

- **Định chiều đồ thị vô hướng liên thông**: Phép biến đổi đồ thị vô hướng liên thông thành đồ thị có hướng liên thông mạnh.

- **Đồ thị vô hướng liên thông**: Một đồ thị vô hướng liên thông là một đồ thị vô hướng mà mọi đỉnh đều có thể tiếp cận được từ mọi đỉnh khác.

- **Cầu (cạnh)**: Một cạnh trong đồ thị được gọi là cầu nếu việc loại bỏ nó làm tăng số lượng thành phần liên thông của đồ thị.

- **Strongly Connected Components**: A set of vertices in a directed graph such that for every pair of vertices u and v, either u is reachable from v or v is reachable from u.

- **Đồ thị Euler**: Đồ thị có chu trình Euler (đi qua mỗi cạnh đúng một lần).

- **Đồ thị nửa Euler**: Đồ thị có đƣờng đi Euler (đi qua mỗi cạnh đúng một lần).

- **Chu trình Euler**: Một chu trình trong đồ thị mà đi qua mỗi cạnh đúng một lần.

- **Euler Cycle**: An algorithm to find an Euler cycle in a graph, starting at a specified vertex.

- **Đồ thị có hướng**: Một đồ thị có hướng G =<V,E> trong đó V là tập các đỉnh và E là tập các cạnh có hướng.

- **Liên thông yếu**: Một đồ thị có hướng G =<V,E> là liên thông yếu nếu có thể duyệt được tất cả các đỉnh của đồ thị bằng cách sử dụng các thuật toán duyệt đồ thị như DFS hoặc BFS.

- **Đỉnh bậc lẻ**: Một đỉnh trong đồ thị có bậc (số cạnh nối đến từ đó) là số lẻ.

- **Ke(s)**: Danh sách các cạnh nối đến đỉnh s trong đồ thị vô hướng.

- **Đồ thị Hamilton**: Đồ thị có chu trình Hamilton là một chu trình trong đồ thị mà mỗi đỉnh xuất hiện đúng một lần.

- **Chu trình Hamilton**: Một chu trình trong đồ thị mà nó đi qua mỗi đỉnh chính xác một lần.

- **Cây**: Đồ thị vô hướng liên thông không có chu trình.

- **Rừng**: Đồ thị mà mỗi thành phần liên thông của nó là một cây.

- **Cây khung**: Một cây là một cây khung của một đồ thị G nếu tập đỉnh của cây bằng tập đỉnh của G.

- **Tree-DFS**: A Depth-First Search algorithm applied to a tree or graph.

- **V**: Set of vertices (nodes) in a graph.

- **Tree-Graph-DFS**: A graph traversal algorithm using Depth-First Search (DFS) to explore a graph.

- **Hàng đợi**: Một cấu trúc dữ liệu cho phép thêm và xóa các phần tử ở hai đầu, đảm bảo thứ tự thêm vào.

- **Tree-BFS**: A specific implementation of BFS algorithm used to traverse a tree.

- **Đồ thị vô hướng**: Đồ thị mà các cạnh không có hướng.

- **Cây khung nhỏ nhất**: Tập hợp các cạnh tạo thành một đồ thị liên thông không chu trình có độ dài nhỏ nhất.

- **Độ dài của tập cạnh cây khung**: Tổng trọng số của các cạnh trong tập cạnh cây khung.

- **Cây khung nhỏ nhất (Minimum Spanning Tree - MST)**: Một đồ thị vô hướng không chứa chu trình, bao phủ tất cả các đỉnh của đồ thị và có tổng trọng số các cạnh nhỏ nhất.

- **Thuật toán Prim**: Một thuật toán để tìm cây khung nhỏ nhất của một đồ thị không có hướng, bắt đầu từ một đỉnh và dần dần thêm các cạnh có trọng số nhỏ nhất để kết nối các đỉnh chưa được bao phủ.

- **Độ dài của đường đi**: Tổng các trọng số của các cạnh trong một đường đi.

- **Khoảng cách ngắn nhất**: Độ dài của đường đi ngắn nhất từ một đỉnh nguồn đến một đỉnh đích.

- **Dijkstra's Algorithm**: An algorithm to find the shortest paths from a starting vertex to all other vertices in a graph with non-negative edge weights.

- **Shortest Path**: The path between two vertices in a graph with the minimum total edge weight.

- **Bellman-Ford algorithm**: An algorithm to find the shortest paths from a single source vertex to all other vertices in a graph, even if the graph contains negative edge weights. It detects negative cycles.

- **D[i]**: A sequence of values calculated within the algorithm.

- **A[i, j]**: A matrix element representing a coefficient in the algorithm.

- **Floy's Algorithm**: An algorithm for finding the shortest paths between all pairs of vertices in a weighted graph, typically used when the graph does not contain negative cycles.

- **Floy Algorithm**: An algorithm for finding the shortest paths between all pairs of vertices in a weighted graph.

- **Initialization**: The first step of the algorithm where the distances between all pairs of vertices are initialized to the edge weights.

- **Flight itinerary**: A sequence of flights, where each flight connects two consecutive cities in the itinerary.