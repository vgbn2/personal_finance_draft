#include <stdio.h>

void swap(int *a, int *b) {
    int temp = *a;
    *a = *b;
    *b = temp;
}

void selectsort(int arr[], int n) {
    for(int i = 0; i < n - 1; i++) {
        for(int j = i + 1; j < n; j++) {
            if(arr[j] < arr[i]) {
                swap(&arr[i], &arr[j]);
            }
        }
    }
}

void nhap(int arr[], int n) {
    for(int i = 0; i < n; i++) {
        scanf("%d", &arr[i]);
    }
}

int main() {
    int n, arr[100];
    scanf("%d", &n);
    nhap(arr, n);
    selectsort(arr, n);

    printf("%d ", arr[0]);
    for(int i = 1; i < n; i++) {
        if(arr[i] > arr[0]) {
            printf("%d\n", arr[i]);
            return 0;
        }
    }
}
