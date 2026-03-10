#include <stdio.h>
#include <stdbool.h>
bool nto(int n){
    if(n<2)return 0;
    for(int i=2;i*i<=n;i++){
        if(n%i==0)return 0;
    }
    return 1;
}
int main(){
    int a,b;scanf("%d%d",&a,&b);
    int ar[50][50];
    for(int i=0;i<a;i++){
        for(int j=0;j<b;j++){
            scanf("%d",&ar[i][j]);
            if(nto(ar[i][j])){
                ar[i][j]=1;
            }
            else ar[i][j]=0;
        }
    }

    for(int i=0;i<a;i++){
        for(int j=0;j<b;j++){
            printf("%d ",ar[i][j]);
        }
        printf("\n");
    }
}