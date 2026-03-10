#include <stdio.h>
int main(){
    int t;scanf("%d",&t);
    for(int i=1;i<=t;i++){
        int a;scanf("%d",&a);
        int ar[10000],dr[10000]={0};
        for(int j=0;j<a;j++){
            scanf("%d",&ar[j]);
            dr[ar[j]]=dr[ar[j]]+1;
        }
        printf("Test %d:\n",i);

        for(int j=0;j<a;j++){
            if(dr[ar[j]]>0){
                printf("%d xuat hien %d lan\n",ar[j],dr[ar[j]]);
                dr[ar[j]]=0;
            }
        }
    }
    
}