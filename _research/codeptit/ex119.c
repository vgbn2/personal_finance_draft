#include <stdio.h>
void swap(int *a,int *b){
    int temp=*a;
    *a=*b;
    *b=temp;
}
void selectsort(int arr[],int n){
    for(int i=0;i<n-1;i++){
        for(int j=i+1;j<n;j++){
            if(arr[j]<arr[i])
            swap(&arr[i],&arr[j]);
        }
    }
}
void nhap(int arr[],int n){
    for(int i=0;i<n;i++){
        scanf("%d",&arr[i]);
    }
}
int main(){
    int n;scanf("%d",&n);
    int arr[1000];
    nhap(arr,n);
    selectsort(arr,n);
   printf("%d ",arr[n-1]);
   for(int i=n-2;i>=0;i--){
    if(arr[i]<arr[n-1]){
        printf("%d",arr[i]);
        return 0;
    }
   }
}