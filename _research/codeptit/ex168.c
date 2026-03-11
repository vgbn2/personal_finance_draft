#include <stdio.h>
#include <stdbool.h>
typedef long long ll;
bool fibonaci(long long n){
    if(n==0||n==1){
     return true;
    }
     ll a=0,b=1,next=a+b;
    while(next<n){
     if(b==n)return true;
     next=a+b;
     a=b;
     b=next;
    }
    if(next==n)return 1;
    return 0;
}

int main() {
    int a;
    scanf("%d" ,&a);
    for(int i=0;i<a;i++){
        long long b;
        scanf("%lld",&b);
    if(fibonaci(b))printf("YES\n");
    else printf("NO\n");
    }
    }
    