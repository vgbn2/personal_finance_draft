#include<stdio.h>
int ngto(int n){
    if(n<2)return 0;
    for(int i=2;i*i<=n;i++){
        if(n%i==0)return 0;
    }
    return 1;
}
int main(){
    int n,m,p ;scanf("%d %d%d",&n,&m,&p);
    int c[100][100];
    int d[100][100];
    int e[100][100];
    for(int i=0;i<n;i++){
        for(int j=0;j<m;j++){
            scanf("%d",&c[i][j]);
        }
    }
    for(int i=0;i<m;i++){
        for(int j=0;j<p;j++){
            scanf("%d",&d[i][j]);
        }
    }
    for (int i = 0; i < n; i++){
        for (int j = 0; j < p; j++){
            e[i][j] = 0;
            }
            }

    for (int i = 0; i < n; i++) {
        for (int j = 0; j < p; j++) {
            for (int k = 0; k < m; k++) {
                e[i][j] += c[i][k] * d[k][j];
            }
        }
    }

    for(int i=0;i<n;i++){
        for(int j=0;j<p;j++){
            printf("%d ",e[i][j]);
        }
        printf("\n");
    }

}