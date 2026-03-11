#include <stdio.h>

long long fibonaci(int a){
    if(a<2)return a;
    return fibonaci(a-1)+fibonaci(a-2);
}
int main() {
    int a;
    scanf("%d" ,&a);
    for(int i=0;i<a;i++){
    printf("%lld ",fibonaci(i));
    printf(" ");
    }
    }
    