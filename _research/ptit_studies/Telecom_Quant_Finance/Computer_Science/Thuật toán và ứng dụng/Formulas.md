# 🧮 Formulas for Thuật toán và ứng dụng

- **USCLN (int a, int b)**: $$int USCLN ( int a,  int  b) { while (b!=0 ) { x = a % b; a = b; b =x; } return(a); }$$ - Tìm số nguyên lớn nhất chia hết cho cả a và b (Euclide Algorithm)

- **Sorting Criterion**: $$S[j] >= F[i]$$ - The condition for selecting an activity j, based on its start time being greater than or equal to the finish time of the current selected activity.

- **Công thức tính tổng bình phương số lần xuất hiện mỗi ký tự**: $$P = Σ(i=1 to N) (count(S[i])^2)$$ - Tính tổng bình phương số lần xuất hiện của mỗi ký tự trong chuỗi S.

- **Công thức truy hồi**: $$F[m, v] = F[m-1, v] + F[m, v-m]$$ - Công thức này được sử dụng trong quy hoạch động để tính toán giá trị của một bài toán con dựa trên giá trị của các bài toán con nhỏ hơn.

- **F[m, v]**: $$F[m, v] = số cách phân tích số v thành tổng các số nguyên dương nhỏ hơn hoặc bằng m.$$ - Đây là công thức cơ bản trong quy hoạch động để giải bài toán chia số thành tổng các số nguyên dương.

- **Bellman-Ford Equation**: $$d(v, k) = min { d(v, i) + d(i, k) }$$ - The Bellman-Ford equation is the core of the algorithm, iteratively updating the shortest distance from a vertex 'v' to another vertex 'k' by considering all possible intermediate vertices 'i'.

- **Thuật toán sắp xếp Bubble Sort**: $$O(n^2)$$ - Thuật toán sắp xếp Bubble Sort là một thuật toán sắp xếp đơn giản, lặp đi lặp lại so sánh các cặp phần tử liền kề và hoán đổi chúng nếu chúng không đúng thứ tự.

- **Chiều cao cây nhị phân**: $$h = ⌈log₂(N+1)⌉$$ - Chiều cao tối thiểu của cây nhị phân có N node.

- **Số lượng node lá**: $$L = 2^h - 1$$ - Số lượng node lá trong cây nhị phân đầy đủ có chiều cao h.