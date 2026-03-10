#include <stdio.h>

int main(){
    int t;
    scanf("%d",&t);
    while(t--){
        int n;
        scanf("%d",&n);
        printf("%lld\n",(long long)n*n);
    }
}