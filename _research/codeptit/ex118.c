#include<stdio.h>
int main(){
    int n,i,m;scanf("%d",&n);
    int arr[100];
    for(i=0;i<n;i++)
    {
        scanf("%d",&arr[i]);
    }
    scanf("%d",&m);
    for(i=n-m;i<n;i++)
    {
       printf("%d ",arr[i]);
    } 
    for(i=0;i<n-m;i++)
    {
       printf("%d ",arr[i]);
    }

}