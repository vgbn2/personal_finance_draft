#include <stdio.h>
#include <stdbool.h>
typedef long long ll;
bool thng(ll a){
    ll rev=0,o=a;
    while(a>0){
        rev=rev*10+a%10;
        a/=10;
    }
    return rev==o;
}
int main(){
    int t;scanf("%d",&t);
    for(int i=0;i<t;i++){
        ll a;scanf("%lld",&a);
        int sum=0;ll o=a;
        while(a>0){
            sum+=a%10;
            a/=10;
        }
        if(o%2!=0&&sum%2!=0&&thng(o)){
            printf("YES\n");
        }
        else printf("NO\n");
    }
}