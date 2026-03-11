#include <stdio.h>
int main(){
    int n,sum=0;scanf("%d",&n);
    int arr[100];
    for(int i=0;i<n;i++){
        scanf("%d",&arr[i]);
    }
    for(int j=0;j<n;j++){
        sum+=arr[j];
    }
    printf("%.3lf",(double)sum/n);
}