#include <stdio.h>
#include <stdbool.h>

bool check(int n){
    if(n<2)return 0;
    for(int i=2;i*i<=n;i++){
        if(n%i==0)return 0;
    }
    return 1;
}
int main(){
    int a;scanf("%d",&a);
    for(int i=0;i<a;i++){
        int b;scanf("%d",&b);
        for(int j=2;j<=b/2;j++){
            if(check(j)){
                if(check(b-j)){
                    printf("%d %d ",j,b-j);
                }
            }
        }
        printf("\n");
    }
}