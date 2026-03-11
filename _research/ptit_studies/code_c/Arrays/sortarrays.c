#include <stdio.h>
void swap(int *a, int *b){
    int tmp = *a;
    *a = *b;
    *b = tmp;
}
void selectionsort(int arr[], int n) {
    int nb;
    for (int i = 0; i < n - 1; i++) {
        nb = i;
        for (int j = i + 1; j < n; j++)
            if (arr[j] < arr[nb])
                nb = j;
        swap(&arr[nb],&arr[i]);
    }
}
void bubblesort(int a[],int n){
    
}
void solve(){
    int n ;scanf("%d",&n);
    int a[101],nb=0;
    for(int i=0;i<n;i++){
        scanf("%d",&a[i]);
    }
    selectionsort(a,n);
    for(int i=0;i<n;i++){
        printf("%d ",a[i]);
    }
    printf("\n");
}
int main(){
    int t;scanf("%d",&t);
    for(int i=0;i<t;i++){
        solve();
    }
}