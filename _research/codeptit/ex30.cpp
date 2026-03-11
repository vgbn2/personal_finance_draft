#include <stdio.h>
int main(){
    long long n,a=1;
    long long b=0;
    scanf("%lld",&n);
    for(long long i=1;i<=n;i++){
        a*=i;
        b+=a;
    }
    printf("%lld",b);
}