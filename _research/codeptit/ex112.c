#include <stdio.h>
int main(){
    int t;scanf("%d",&t);
    int arr[1000], dr[1000]={0};
    for(int i=0;i<t;i++){
        scanf("%d",&arr[i]);
        dr[arr[i]]=dr[arr[i]]+1;
    }
    for(int i=0;i<t;i++){
        if(dr[arr[i]]>0){
            printf("%d %d\n",arr[i],dr[arr[i]]);
            dr[arr[i]]=0;
        }
    }
}