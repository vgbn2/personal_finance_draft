#include <stdio.h>
void swap(int *a,int *b){
    int temp=*a;
   *a=*b;
    *b=temp;
}
void selectsort(int ar[],int n){
    for(int i=0;i<n-1;i++){
        int min=i;
        for(int j=i+1;j<n;j++){
            if(ar[j]<ar[min])
           min=j;
        }
        swap(&ar[i],&ar[min]);
    }
}
int main(){
    int t,ar[1000];scanf("%d",&t);
    for(int i=0;i<t;i++){
        scanf("%d",&ar[i]);
    }
    selectsort(ar,t);
    for(int i=t-1;i>=0;i--){
        printf("%d ",ar[i]);
    }
    return 0;
}