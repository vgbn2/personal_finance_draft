#include <stdio.h>
#include <stdbool.h>
#include <math.h>
bool check(int n){
    int rev=0;int tp=n;
    if(n<2) return 0;
    for(int i=2;i<sqrt(n);i++){
        if(n%i==0)return 0;
    }
    while(tp>0){
        rev=rev*10+tp%10;
        tp/=10;
    }
    for(int i=2;i<sqrt(rev);i++){
        if(rev%i==0)return 0;
    }
    return 1;
}

int main(){
    int t;scanf("%d",&t);
    for(int i=0;i<t;i++){
        int a;scanf("%d",&a);
        if(check(a))
        printf("1\n");
        else
        printf("0\n");
    }
}