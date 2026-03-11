#include <stdio.h>
#include <stdbool.h>
bool ngto(int n){
    if(n<2)return 0;
    for(int i=2;i*i<=n;i++){
        if(n%i==0)return 0;
    }
    return 1;
}
int main(){
    int t;scanf("%d",&t);

    for(int i=1;i<=t;i++){
        int ar[101],dr[10000]={0};int max=0;
        int a;scanf("%d",&a);

        for(int j=0;j<a;j++){
            scanf("%d",&ar[j]);//nhập và sort
            if(ar[j]>max){
                max=ar[j];
            }
            if(ngto(ar[j])){
                dr[ar[j]]++;//nếu ngto count++
            }
        }

        printf("Test %d:\n",i);

        for(int j=2;j<=max;j++){
            if(dr[j]>=1){
                printf("%d xuat hien %d lan\n",j,dr[j]);
            }
        }
    
    }
}