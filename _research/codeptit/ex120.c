#include <stdio.h>
void swap(int *a, int *b){
    int temp = *a;
    *a = *b;
    *b = temp;
}
void selectsort(int arr[], int n){
    for(int i = 0; i < n - 1; i++){
        int min = i;
        for(int j = i + 1; j < n; j++){
            if(arr[j] < arr[min]){
                min = j;
            }
        }
        swap(&arr[i], &arr[min]);
    }
}

int main(){
    int t, arr[1000];scanf("%d", &t);
    for(int i = 0; i < t; i++){
        scanf("%d", &arr[i]);
    }
    selectsort(arr, t); 
    for(int i = 0; i < t; i++){
        if(arr[i]%2==0)
        printf("%d ", arr[i]);
    }

    return 0;
}
