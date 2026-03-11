#include <stdio.h>

// Giả sử các số trong mảng không quá lớn (ví dụ < 1000)
int checkSumFast(int arr[], int size, int target) {
    int seen[1001] = {0}; // Mảng đánh dấu, khởi tạo tất cả bằng 0

    for (int i = 0; i < size; i++) {
        int complement = target - arr[i];
        if (complement >= 0 && complement <= 1000) {
            if (seen[complement] == 1) {//
                return 1; // Tìm thấy cặp!
            }
        }

        if (arr[i] <= 1000) {
            seen[arr[i]] = 1;
        }
    }
    return 0;
}

int main() {
    int myNumbers[] = {5, 8, 2, 10};
    int target = 7;
    int size = 4;

    if (checkSumFast(myNumbers, size, target)) {
        printf("Tim thay!\n");
    } else {
        printf("Khong tim thay.\n");
    }
    return 0;
}