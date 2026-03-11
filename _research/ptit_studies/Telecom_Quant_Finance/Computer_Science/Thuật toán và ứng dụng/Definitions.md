# 📖 Definitions for Thuật toán và ứng dụng

- **Thuật toán**: Một thủ tục hoặc trình tự thực hiện các công việc của máy tính, nhận input và sinh ra output.

- **Độ phức tạp thuật toán**: Đo lường tài nguyên (thời gian, bộ nhớ) cần thiết để thuật toán chạy.

- **Độ phức tạp chương trình**: Đo lường tài nguyên cần thiết để chương trình chạy.

- **Thuật toán F giải bài toán P**: Dãy các thao tác sơ cấp F1, F2,..,FN trên tập dữ kiện đầu vào (Input) để đưa ra được kết quả ra (Output).

- **Back-Tracking**: A problem-solving technique that systematically explores all possible solutions by trying each option and abandoning it if it leads to a dead end.

- **Dãy con**: A subset of a set, formed by selecting some or all of the elements of the set.

- **Đường đi Hamilton**: Đường đi đơn trên đồ thị đi qua tất cả các đỉnh của đồ thị mỗi đỉnh đúng một lần.

- **Tô màu đồ thị**: Kiểm tra xem đồ thị có thể tô màu các đỉnh bằng nhiều nhất M màu sao cho hai đỉnh kề nhau đều có màu khác nhau hay không.

- **Sudocu**: Một bài toán điển hình cho kỹ thuật quay lui, yêu cầu điền các số từ 1 đến 9 vào một lưới 9x9 sao cho mỗi hàng, cột và hình vuông 3x3 đều chứa các số từ 1 đến 9 một lần.

- **Thuật toán tham lam (Greedy Algorithm)**: Một chiến lược giải quyết bài toán tối ưu bằng cách đưa ra lựa chọn tốt nhất tại mỗi bước, dựa trên thông tin hiện có, với mục tiêu đạt được giải pháp tối ưu toàn cục.

- **Giải pháp tối ưu cục bộ**: Một giải pháp mà tại một điểm nhất định trong quá trình giải quyết, nó là tốt nhất so với các giải pháp khác trong cùng một không gian tìm kiếm cục bộ.

- **Greedy-Activities-Selection**: An algorithm that selects activities based on the earliest finish times, aiming to maximize the number of activities completed.

- **OPT**: Represents the set of activities selected to maximize the number of activities that can be performed.

- **Thuật toán tham lam**: Một thuật toán giải quyết một bài toán bằng cách đưa ra các quyết định tối ưu cục bộ tại mỗi bước, mà không xem xét đến các bước tiếp theo.

- **Thuật toán Kruskal**: Một thuật toán tìm cây khung nhỏ nhất (Minimum Spanning Tree - MST) của một đồ thị bằng cách sắp xếp các cạnh theo trọng số tăng dần và thêm vào cây khung nhỏ nhất nếu cạnh không tạo thành chu trình.

- **Quy hoạch động**: Một phương pháp giải bài toán bằng cách chia bài toán lớn thành các bài toán con, sử dụng kết quả của các bài toán con để giải bài toán lớn.

- **Cấu trúc con tối ưu**: Một bài toán có thể được chia thành các bài toán con, và lời giải của các bài toán con này có thể được sử dụng để xây dựng lời giải cho bài toán lớn hơn.

- **Floyd-Warshall Algorithm**: An algorithm for computing all pairs shortest paths in a weighted graph. It uses dynamic programming to iteratively improve the shortest path estimates.

- **Dynamic Programming**: A technique for solving optimization problems by breaking them down into smaller, overlapping subproblems and storing the solutions to these subproblems to avoid recomputation.

- **Bài toán cái túi (Knapsack Problem)**: Một bài toán tối ưu hóa trong đó cần chọn một tập hợp các vật phẩm từ một tập hợp các vật phẩm có trọng lượng và giá trị sử dụng khác nhau để tối đa hóa tổng giá trị sử dụng mà không vượt quá một trọng lượng giới hạn.

- **Xâu đối xứng (Palindrome)**: Một chuỗi các ký tự đọc được cùng một cách theo cả hai hướng (trước và sau).

- **Dãy được sắp xếp (Sorted Array)**: Một mảng các phần tử được sắp xếp theo một trật tự tăng dần hoặc giảm dần.

- **Ngăn xếp (stack)**: Cấu trúc dữ liệu theo kiểu xếp chồng hoạt động theo nguyên tắc vào trước ra sau (LIFO: fist in last out).

- **FILO (First – In – Last – Out)**: Tập hợp các node thông tin được tổ chức liên tục hoặc rời rạc nhau trong bộ nhớ và thực hiện theo cơ chế vào trước ra sau.

- **Stack**: Một cấu trúc dữ liệu hỗ trợ các thao tác LIFO (Last-In, First-Out) - vào trước, ra sau.

- **Infix, Prefix, Postfix**: Các dạng biểu diễn khác nhau của một biểu thức toán học, trong đó phép toán được đặt ở vị trí khác nhau.

- **FIFO (First-In-First-Out)**: Nguyên tắc hoạt động của hàng đợi, nghĩa là phần tử đầu vào hàng đợi sẽ được lấy ra đầu tiên.

- **Hàng đợi hai điểm cuối (double ended queue)**: Hàng đợi được xây dựng theo nguyên tắc phép đưa phần tử vào và lấy phần tử ra khỏi hàng đợi được thực hiện ở hai điểm cuối.

- **Cây nhị phân đầy đủ**: Cây nhị phân đúng và tất cả node lá đều có mức là d (d là chiều sâu của cây).

- **Cây nhị phân tìm kiếm**: Cây nhị phân thỏa mãn điều kiện: hoặc là rỗng hoặc có một node gốc. Mỗi node gốc có tối đa hai node con. Nội dung node gốc lớn hơn nội dung node con bên trái và nhỏ hơn nội dung node con bên phải. Hai cây con bên trái và bên phải cũng hình thành nên hai cây tìm kiếm.

- **Cây nhị phân**: Cây có mỗi node có thể có tối đa hai con.

- **Cây tổng**: Cây nhị phân trong đó tổng các giá trị node con của node trung gian bằng giá trị node cha.

- **Perfect Tree**: A tree where every node has exactly two children.

- **Full Binary Tree**: A tree where every node has either zero or two children.

- **Identical Trees**: Two trees that are structurally identical.

- **Preorder Traversal**: A tree traversal algorithm that visits the root node first, then recursively traverses the left subtree, and finally recursively traverses the right subtree.

- **Balanced Binary Search Tree**: A binary search tree where the heights of the left and right subtrees of any node differ by at most one.

- **Common Elements**: The set of elements that are present in all given arrays.