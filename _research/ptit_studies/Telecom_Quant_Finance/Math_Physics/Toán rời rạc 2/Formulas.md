# 🧮 Formulas for Toán rời rạc 2

- **Định lý 1**: $$∑_{v∈V} deg(v) = 2|E|$$ - Tổng bậc của tất cả các đỉnh bằng hai lần số cạnh trong đồ thị vô hướng.

- **Ma trận kề của đồ thị vô hướng**: $$A = { aij: aij = 1 nếu (i, j) E, aij = 0 nếu (i,j) E; i, j =1, 2, . . ., n}$$ - Represents a directed graph using a matrix where elements are 1 if there's an edge between vertices and 0 otherwise.

- **Tính chất ma trận kề đồ thị vô hướng**: $$

- **Tính chất ma trận kề đồ thị có hướng**: $$

- **Ap = A.A...**: $$Ap = A^p$$ - Ma trận A lũy thừa p lần, biểu diễn các đường đi khác nhau từ đỉnh i đến đỉnh j qua p-1 đỉnh trung gian.

- **Mảng VT**: $$VT[6] = {0, 2, 6, 9, 13, 16, 18}$$ - Mảng VT được sử dụng để ánh xạ các đoạn trong mảng A[] đến vị trí của chúng.

- **DFS(u)**: $$DFS(u) = {1, 2, ..., n}$$ - Định nghĩa của DFS(u) là tập hợp tất cả các đỉnh có thể tiếp cận được từ đỉnh u trong đồ thị.

- **BFS Algorithm**: $$Queue = ; Push(Queue,u); chuaxet[u] = False;$$ - Initialization step of the BFS algorithm.

- **Ma trận Kề**: $$A[i][j] = 1  nếu có cạnh từ đỉnh i đến đỉnh j,  0 nếu không$$ - Represents the adjacency matrix of a graph.

- **DFS Algorithm**: $$DFS(G, s) = {V_0, V_1, ..., V_k} where V_i is a set of vertices reachable from s in k steps$$ - A recursive algorithm to find all reachable nodes from a starting node in a graph.

- **Định lý 1 (tiếp)**: $$G=<V, E> là đồ thị Euler khi và chỉ khi tất cả các đỉnh của nó đều có bán đỉnh bậc ra bằng bán đỉnh bậc vào.$$ - Điều kiện cần và đủ để đồ thị có hướng liên thông yếu là Euler.

- **Định lý 2**: $$G =<V,E> là đồ thị nửa Euler khi và chỉ khi G có 0 hoặc 2 đỉnh bậc lẻ.$$ - Liên quan đến đồ thị vô hướng liên thông.

- **Định lý 3**: $$G =<V,E> là đồ thị nửa Euler khi và chỉ khi tồn tại đúng hai đỉnh u, v  V sao cho deg+(u) - deg-(u)= deg-(v) - deg+(v)=1.$$ - Liên quan đến đồ thị có hƣớng liên thông yếu.

- **DFS (Depth-First Search)**: $$DFS(u) = {v ∈ N(u) | DFS(v) chưa được thực hiện}$$ - Một thuật toán duyệt đồ thị tìm kiếm sâu nhất từ đỉnh u, đánh dấu các đỉnh đã được thăm.

- **BFS (Breadth-First Search)**: $$BFS(u) = {v ∈ N(u) | BFS(v) chưa được thực hiện}$$ - Một thuật toán duyệt đồ thị tìm kiếm theo chiều rộng từ đỉnh u, đánh dấu các đỉnh đã được thăm.

- **Initialization**: $$for (vV )  chuaxet[v] = true;$$ - Thiết lập trạng thái của tất cả các đỉnh trong đồ thị thành 'true' (không đã được thăm).

- **Tree-DFS(u)**: $$Tree-DFS(u) = T$$ - The recursive Depth-First Search algorithm starting from vertex u, resulting in the tree T.

- **Độ dài cây khung**: $$c(H) = ∑_{e ∈ T} c(e)$$ - Tổng độ dài các cạnh trong cây khung H.

- **Kruskal's Algorithm**: $$T = ; D(H) = 0$$ - Initialization: T (empty set of edges), D(H) (length of the minimum spanning tree).

- **Dijkstra's Algorithm**: $$d[v] = min { d[z] | zT}$$ - The algorithm iteratively updates the shortest distance (d[v]) to each vertex v in the set T until all reachable vertices have been processed.

- **Bellman-Ford**: $$D[v] = D[u] + A[u][v]$$ - Update distance to vertex v based on shorter path through vertex u.

- **Bellman-Ford Relaxation**: $$D[v] = min(D[v], D[u] + C[u][v])$$ - Relaxation step in the Bellman-Ford algorithm, updating the shortest distance to vertex 'v' if a shorter path is found through vertex 'u'.