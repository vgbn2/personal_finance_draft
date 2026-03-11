#include<stdio.h>
typedef long long ll;
void swap(int *a,int *b){
int temp=*a;
*a=*b;
*b=temp;
}
ll gt(ll a){
    ll o=a,sum=0;
    while(a>0){
        ll tic=1;
        for(int i=1;i<=a%10;i++){
            tic*=i;
        }
        sum+=tic;
        a/=10;
    }
    return sum==o;
}
int main(){
    int a,b;scanf("%d%d",&a,&b);
    if(a>b)swap(&a,&b);
    for(ll i=a;i<=b;i++){
        if(gt(i))
        printf("%lld ",i);
    }
}