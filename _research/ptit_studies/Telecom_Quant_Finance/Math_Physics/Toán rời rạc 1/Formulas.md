# 🧮 Formulas for Toán rời rạc 1

- **Cộng số nhị phân**: $$a + b = (an-1an-2 ... a1a0)₂ + (bn-1bn-2 ... b1b0)₂$$ - Cộng hai số nhị phân bằng cách thực hiện phép cộng bit theo quy tắc làm tròn.

- **N(A ∪ B)**: $$N(A ∪ B) = N(A) + N(B)$$ - Nguyên lý cộng: Số phần tử của hợp của hai tập rời nhau.

- **N(A  B)**: $$N(A  B) = N(A) N(B)$$ - Nguyên lý nhân: Số phần tử của tích của hai tập hợp là tích của số phần tử của mỗi tập hợp.

- **Công thức tính số phần tử của hợp 3 tập**: $$N(A∪B∪C) = N(A) + N(B) + N(C) - N(A∩B) - N(A∩C) - N(B∩C) + N(A∩B∩C)$$ - Công thức tính số phần tử của hợp của 3 tập không rời nhau.

- **Nguyên lý bù trừ**: $$N(A ∪ B) = N(A) + N(B) - N(A ∩ B)$$ - Used for calculating the number of elements in the union of two sets.

- **Công thức chỉnh hợp không lặp**: $$P(n, k) = rac{n!}{(n-k)!}$$ - Công thức tính số chỉnh hợp không lặp chập k của n phần tử.

- **P(n,k)**: $$P(n,k) = rac{n!}{(n-k)!}$$ - Số hoán vị của k phần tử trong tập n phần tử.

- **C(n, k)**: $$C(n, k) = n! / (k! * (n-k)!)$$ - The combination formula, representing the number of ways to choose k items from a set of n items without regard to order.

- **C(n+k-1, k)**: $$C(n+k-1, k)$$ - Công thức tính tổ hợp lặp chập k từ tập n phần tử.

- **Dn**: $$Dn = (n-1) (Dn-1 + Dn-2)$$ - Công thức truy hồi cho số mất thứ tự, với D1 = 0, D2 = 1.

- **r² - c₁r + c₂ = 0**: $$r² - c₁r + c₂ = 0$$ - Phương trình đặc trưng của hệ thức truy hồi tuyến tính thuần nhất.

- **an = α₁r₁ⁿ + α₂r₂ⁿ**: $$an = α₁r₁ⁿ + α₂r₂ⁿ$$ - Biểu diễn nghiệm của hệ thức truy hồi với nghiệm đặc trưng r1 và r2.

- **r2 - r - 2 = 0**: $$r^2 - r - 2 = 0$$ - Phương trình đặc trưng của hệ thức truy hồi an = an-1 + 2an-2 với a0 = 2, a1 = 7.

- **Hệ thức chia để trị**: $$f(n) = (n/b) * f(n/b)$$ - Hệ thức này mô tả cách chia bài toán cỡ n thành các bài toán nhỏ hơn, với mỗi bài toán nhỏ có cỡ n/b.

- **Mn**: $$Mn = 2n! * Un$$ - Formula for the number of ways to arrange couples around a circular table such that no couple sits together.

- **Un**: $$Un = number of permutations satisfying (i) ≠ i and (i) ≠ i+1$$ - Un represents the number of derangements of n elements.

- **C(n-k+1, k)**: $$C(n-k+1, k)$$ - The number of ways to select k non-adjacent elements from n elements arranged in a line.

- **C(n-k, k)**: $$C(n-k, k)$$ - The number of ways to select k non-adjacent elements from n elements arranged in a circle.

- **L(p,n) = n! K(p,n)**: $$L(p,n) = n! K(p,n)$$ - Công thức tính số hình chữ nhật la tinh p x n, với K(p,n) là số hình chữ nhật la tinh chuẩn p x n.

- **L(n,n) = n!(n-1)!ln**: $$L(n,n) = n!(n-1)!ln$$ - Công thức tính số lượng hình vuông la tinh chuẩn cấp n.

- **Định nghĩa O(g(x))**: $$\left| f(x) \right| \leq C \left| g(x) \right|$$ - Định nghĩa toán học cho ký hiệu Big O, biểu diễn sự tăng trưởng của hàm f(x) so với g(x) khi x tiến đến vô cùng.

- **Công thức tính độ phức tạp Bubble Sort**: $$S = n(n-1)/2$$ - Công thức tính số lần so sánh trong thuật toán Bubble Sort.

- **Composition of Functions**: $$T(n) = O(f(n))$$ - If program P takes time T(n) = O(f(n)), then executing k(n) times with k(n) = O(g(n)) results in complexity O(f(n) * g(n)).

- **n(n-1)/2**: $$n(n-1)/2$$ - Công thức tính số lượng các phép toán trong thuật toán sắp xếp Bubble-Sort.

- **Prims Algorithm**: $$X[i] = X[i] + j - i$$ - Updates elements in the current combination to generate the next one.

- **Next Combination Logic**: $$X[i]= X[i]+1; X[j] = X[i] + j - i;$$ - Incrementing the last element and shifting subsequent elements to maintain the combination size.

- **Next_Division**: $$C[i] = C[i] - 1; D = k - i + 1; R = D / C[i]; S = D % C[i];$$ - Updates the partition array and calculates the next partition.

- **Công thức tổng quát cho thuật toán quay lui**: $$T(n) = T(n-1) + T(n-2) + ... + T(0)$$ - Công thức này mô tả cách thuật toán quay lui giải quyết một bài toán bằng cách chia nó thành các bài toán con nhỏ hơn, có thể được giải quyết một cách đệ quy.

- **Permutation Formula**: $$n! = n * (n-1) * (n-2) * ... * 2 * 1$$ - Công thức tính số lượng hoán vị của một tập hợp n phần tử.

- **Bài toán Người du lịch**: $$min_{XD} ∑_{i=1}^{n} c_{ij}$$ - Tìm tổng chi phí đi từ thành phố i đến thành phố j, với c_{ij} là chi phí đi từ thành phố i đến thành phố j.

- **Knapsack Problem Formulation**: $$max ∑_{j=1}^{n} c_j x_j  subject to ∑_{j=1}^{n} x_j <= b, x_j ∈ Z+$$ - This represents the mathematical formulation of the knapsack problem, where x_j is the quantity of item j, c_j is its value, and b is the bag capacity.

- **min_{x} ∑_{j=1}^{n} c_ij x_j**: $$min_{x} ∑_{j=1}^{n} c_ij x_j$$ - Tổng chi phí đi lại giữa các thành phố.

- **Cost Calculation**: $$ =c[1,u2] + c[u2,u3] + . . . + c[uk-1, uk]$$ - Represents the cost of a route, summing the costs of each segment (edge) in the route.

- **Ma trận chi phí**: $$C = {cij: i, j = 1, 2, . . .n}$$ - Ma trận biểu diễn chi phí của các hành trình trong bài toán người du lịch.

- **Branch and Bound**: $$C[6, 3] = , C(3, 6) = $$ - Using the branch and bound method to eliminate paths based on constraints, effectively reducing the search space.

- **Ma trận cấm cạnh**: $$C[i, j] = \infty$$ - Biểu diễn trạng thái cấm một cạnh (i, j) trong quá trình tìm kiếm giải pháp.

- **if A[1, 1] = **: $$if A[1, 1] =  then$$ - Quy tắc lựa chọn cạnh dựa trên giá trị của phần tử trong ma trận chi phí.

- **Dirichlet's Principle**: $$n/k$$ - Số lượng tối thiểu của đối tượng cần thiết để đảm bảo có ít nhất một hộp chứa ít nhất n/k đối tượng.

- **Dirichlet's General Principle**: $$n/k$$ - Nếu đem xếp n đối tƣợng vào k hộp thì luôn tìm đƣợc một hộp chứa ít nhất n/k đối tƣợng.

- **Binomial Coefficient**: $$C(n, k) = n! / (k! * (n-k)!)$$ - Represents the number of ways to choose k items from a set of n items without regard to order.

- **Integral**: $$∫x^2 dx = (x^3)/3 + C$$ - Represents the area under a curve, fundamental in calculus.